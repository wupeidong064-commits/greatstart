// Test-only wall clock. Load with "node --require .../aiHistoryClock.cjs" in this local fixture.
const url = new URL(process.env.DATABASE_URL || 'file:///');
if (
  process.env.NODE_ENV !== 'test' ||
  url.hostname !== '127.0.0.1' ||
  !/^\/buzzer_ai_history_v1(?:_[a-z0-9]{1,20})?$/.test(url.pathname)
) {
  throw Error('The historical clock requires an isolated local history fixture');
}
const RealDate = Date;
const instant = RealDate.parse('2026-11-16T12:00:00+08:00');
// Keep Date() as a function, Date.parse/UTC, subclasses and explicit timestamps intact.
global.Date = new Proxy(RealDate, {
  apply() {
    return new RealDate(instant).toString();
  },
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length ? args : [instant], newTarget);
  },
  get(target, key, receiver) {
    return key === 'now' ? () => instant : Reflect.get(target, key, receiver);
  },
});
