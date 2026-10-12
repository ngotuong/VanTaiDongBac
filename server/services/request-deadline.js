/** Bound upstream wait and preserve caller cancellation. No automatic write retry. */
function withDeadline(fetchImpl, timeoutMs = 8000) {
  return (url, options = {}) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    return fetchImpl(url, { ...options, signal });
  };
}
module.exports = { withDeadline };
