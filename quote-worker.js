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
  const lengths = comments.map(comment => [...comment.text].length);
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
    const length = lengths[replyIndex];
    const indices = previousByLength.get(length) ?? [];
    indices.push(replyIndex);
    previousByLength.set(length, indices);
  }
  return matches;
};

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== "findQuoteMatches") return;
  try {
    respond({matches: findQuoteMatches(message.comments)});
  } catch (error) {
    respond({error: error.message});
  }
});
