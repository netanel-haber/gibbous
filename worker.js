// The background worker: matches quoted replies to their sources, and counts a pull request's
// changed lines with whitespace ignored. Both run here, off the page's thread.

const createQuoteMatcher = (quote, ensureTime) => {
  const pattern = [...quote];
  const maxEdits = Math.floor(pattern.length / 10);
  const supported = pattern.length <= 2000;
  const parts = maxEdits + 1;
  const anchors = [...new Set(Array.from({length: parts}, (_, index) => pattern
    .slice(Math.floor(index * pattern.length / parts), Math.floor((index + 1) * pattern.length / parts))
    .join("")))];
  return {
    maximumLength: supported ? pattern.length + maxEdits : 0,
    minimumLength: supported ? pattern.length - maxEdits : 1,
    rate(text) {
      if (text === quote) return 100;
      const candidate = [...text];
      if (
        !supported
        || candidate.length < pattern.length - maxEdits
        || candidate.length > pattern.length + maxEdits
        || !anchors.some(anchor => text.includes(anchor))
      ) return;
      const beyond = maxEdits + 1;
      let previous = Uint16Array.from(
        {length: candidate.length + 1},
        (_, index) => Math.min(index, beyond),
      );
      let current = new Uint16Array(candidate.length + 1);
      for (let patternIndex = 1; patternIndex <= pattern.length; patternIndex++) {
        if (patternIndex % 32 === 0) ensureTime();
        current.fill(beyond);
        current[0] = patternIndex;
        const first = Math.max(1, patternIndex - maxEdits);
        const last = Math.min(candidate.length, patternIndex + maxEdits);
        let closest = beyond;
        for (let textIndex = first; textIndex <= last; textIndex++) {
          const distance = Math.min(
            previous[textIndex] + 1,
            current[textIndex - 1] + 1,
            previous[textIndex - 1] + (pattern[patternIndex - 1] === candidate[textIndex - 1] ? 0 : 1),
          );
          current[textIndex] = distance;
          closest = Math.min(closest, distance);
        }
        if (closest > maxEdits) return;
        [previous, current] = [current, previous];
      }
      const distance = previous[candidate.length];
      if (distance <= maxEdits) return Math.round(100 * (1 - distance / pattern.length));
    },
  };
};

const findQuoteMatches = comments => {
  const deadline = performance.now() + 750;
  const ensureTime = () => {
    if (performance.now() > deadline) throw new Error("Quote matching timed out.");
  };
  const previousByLength = new Map();
  const matches = [];
  for (const [replyIndex, reply] of comments.entries()) {
    for (const [quoteIndex, quote] of reply.quotes.entries()) {
      ensureTime();
      const matcher = createQuoteMatcher(quote, ensureTime);
      const exact = [];
      for (let index = 0; index < replyIndex; index++) {
        if (index % 64 === 0) ensureTime();
        if (comments[index].text.includes(quote)) exact.push(index);
      }
      const sources = exact.map(index => ({index, rate: 100}));
      if (!exact.length) for (let length = matcher.minimumLength; length <= matcher.maximumLength; length++) {
        for (const index of previousByLength.get(length) ?? []) {
          const rate = matcher.rate(comments[index].text);
          if (rate === undefined) continue;
          sources.push({index, rate});
        }
      }
      sources.sort((left, right) => left.index - right.index);
      const fullSourceIndices = exact.length
        ? sources.filter(({index}) => matcher.rate(comments[index].text) !== undefined)
          .map(({index}) => index)
        : sources.map(({index}) => index);
      matches.push({
        replyIndex,
        quoteIndex,
        sourceIndices: sources.map(source => source.index),
        sourceRates: sources.map(source => source.rate),
        fullSourceIndices,
      });
    }
    const length = [...reply.text].length;
    previousByLength.set(length, [...(previousByLength.get(length) ?? []), replyIndex]);
  }
  return matches;
};

// Insert/delete edit distance between two line arrays (Myers), after trimming the common ends.
// Returns undefined past maxCost steps, so one huge rewrite cannot stall the count.
const editDistance = (before, after, maxCost = 4e7) => {
  let start = 0;
  let endBefore = before.length;
  let endAfter = after.length;
  while (start < endBefore && start < endAfter && before[start] === after[start]) start++;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const n = endBefore - start;
  const m = endAfter - start;
  if (!n || !m) return n + m;
  const offset = n + m + 1;
  const furthest = new Int32Array(2 * offset + 1);
  let cost = 0;
  for (let distance = 0; distance <= n + m; distance++) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      let x = diagonal === -distance
        || (diagonal !== distance && furthest[offset + diagonal - 1] < furthest[offset + diagonal + 1])
        ? furthest[offset + diagonal + 1]
        : furthest[offset + diagonal - 1] + 1;
      let y = x - diagonal;
      while (x < n && y < m && before[start + x] === after[start + y]) {
        x++;
        y++;
      }
      furthest[offset + diagonal] = x;
      if (x >= n && y >= m) return distance;
    }
    cost += 2 * distance + 1 + n + m;
    if (cost > maxCost) return undefined;
  }
};

// Counts a unified diff's added and deleted lines as shown, and with whitespace ignored the way
// git diff -w (GitHub's ?w=1) ignores it. Each file is re-diffed as one sequence of
// whitespace-stripped lines, its hunks joined by placeholders for the unchanged lines between
// them, so a line can still pair with one in a neighboring hunk as it does in git.
const countDiff = text => {
  const totals = {additions: 0, deletions: 0, whitespaceAdditions: 0, whitespaceDeletions: 0};
  const deadline = performance.now() + 10_000;
  const lines = text.split("\n");
  let file;
  const finishFile = () => {
    if (!file) return;
    if (performance.now() > deadline) throw new Error("The diff is too large to count.");
    const before = [];
    const after = [];
    let placeholders = 0;
    let oldEnd;
    for (const hunk of file.hunks) {
      const oldFirst = hunk.oldLength ? hunk.oldStart : hunk.oldStart + 1;
      for (let line = oldEnd ?? oldFirst; line < oldFirst; line++) {
        const placeholder = `\0${placeholders++}`;
        before.push(placeholder);
        after.push(placeholder);
      }
      oldEnd = oldFirst + hunk.oldLength;
      before.push(...hunk.before);
      after.push(...hunk.after);
    }
    let distance = editDistance(before, after);
    if (distance === undefined) {
      // Too costly as one sequence: hunk by hunk, keeping the shown count for any still too costly.
      distance = file.hunks.reduce((sum, hunk) => sum
        + (editDistance(hunk.before, hunk.after) ?? hunk.additions + hunk.deletions), 0);
    }
    const common = (before.length + after.length - distance) / 2;
    totals.additions += file.additions;
    totals.deletions += file.deletions;
    totals.whitespaceAdditions += after.length - common;
    totals.whitespaceDeletions += before.length - common;
  };
  for (let index = 0; index < lines.length;) {
    const line = lines[index++];
    if (line.startsWith("diff --git ")) {
      finishFile();
      file = {hunks: [], additions: 0, deletions: 0};
      continue;
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (!header || !file) continue;
    const hunk = {
      oldStart: Number(header[1]),
      oldLength: header[2] === undefined ? 1 : Number(header[2]),
      before: [],
      after: [],
      additions: 0,
      deletions: 0,
    };
    let oldLeft = hunk.oldLength;
    let newLeft = header[3] === undefined ? 1 : Number(header[3]);
    while ((oldLeft > 0 || newLeft > 0) && index < lines.length) {
      const hunkLine = lines[index++];
      if (hunkLine.startsWith("\\")) continue;
      const content = hunkLine.slice(1).replace(/[ \t\v\f\r]+/g, "");
      if (hunkLine[0] === "+") {
        hunk.after.push(content);
        hunk.additions++;
        newLeft--;
      } else if (hunkLine[0] === "-") {
        hunk.before.push(content);
        hunk.deletions++;
        oldLeft--;
      } else {
        hunk.before.push(content);
        hunk.after.push(content);
        oldLeft--;
        newLeft--;
      }
    }
    file.hunks.push(hunk);
    file.additions += hunk.additions;
    file.deletions += hunk.deletions;
  }
  finishFile();
  return totals;
};

// The diff redirects to patch-diff.githubusercontent.com, which sends no CORS headers, so the page
// cannot read it; the worker can, with the host permissions.
const countPullRequestDiff = async (nwo, number) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(nwo) || !/^\d+$/.test(number)) throw new Error("Not a pull request.");
  const response = await fetch(`https://github.com/${nwo}/pull/${number}.diff`, {credentials: "include"});
  if (!response.ok) throw new Error(`The diff of ${nwo}#${number} returned HTTP ${response.status}.`);
  return countDiff(await response.text());
};

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === "countPullRequestDiff") {
    countPullRequestDiff(message.nwo, message.number).then(respond, error => respond({error: error.message}));
    return true;
  }
  if (message.type !== "findQuoteMatches") return;
  try {
    respond({matches: findQuoteMatches(message.comments)});
  } catch (error) {
    respond({error: error.message});
  }
});
