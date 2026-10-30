export function isValidCron(cron: string): boolean {
  if (!cron || typeof cron !== 'string') return false;
  const parts = cron.trim().split(/\s+/);
  return parts.length === 5;
}

export function shouldRunCronNow(cron: string, date: Date = new Date()): boolean {
  if (!isValidCron(cron)) return false;
  const [min, hr, dom, mon, dow] = cron.trim().split(/\s+/);

  const curMin = date.getMinutes();
  const curHr = date.getHours();
  const curDom = date.getDate();
  const curMon = date.getMonth() + 1;
  const curDow = date.getDay();

  return (
    matchField(min, curMin) &&
    matchField(hr, curHr) &&
    matchField(dom, curDom) &&
    matchField(mon, curMon) &&
    matchField(dow, curDow)
  );
}

function matchField(pattern: string, val: number): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2), 10);
    return !isNaN(step) && val % step === 0;
  }
  const num = parseInt(pattern, 10);
  return num === val;
}
