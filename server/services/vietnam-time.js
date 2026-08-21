const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function shiftDateKey(dateKey, days) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0)));
  return date.toISOString().slice(0, 10);
}

function vietnamClock(currentTime) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(currentTime);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateKey = `${value.year}-${value.month}-${value.day}`;
  return {
    dateKey,
    previousDateKey: shiftDateKey(dateKey, -1),
    hour: Number(value.hour),
    minute: Number(value.minute)
  };
}

module.exports = { VIETNAM_TIME_ZONE, shiftDateKey, vietnamClock };
