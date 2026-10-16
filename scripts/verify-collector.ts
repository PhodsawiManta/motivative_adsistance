import { WindowsActivityCollector } from '../packages/core/src/windows-collector';
import { openDatabase } from '../packages/database/src';
import { ActivityService } from '../packages/core/src/activity';
const store = openDatabase(':memory:');
store.setSettings({ trackingEnabled: true });
const activity = new ActivityService(store);
let samples = 0;
const collector = new WindowsActivityCollector((event) => {
  // Do not print potentially sensitive window titles during verification.
  activity.ingest([event]);
  console.log(
    JSON.stringify({
      valid: true,
      source: event.source,
      applicationPresent: event.application !== 'Unknown',
      contextMatches: activity.context().activeApplication === event.application,
      titleLength: event.title.length,
      idle: event.idle,
      fullscreen: event.metadata.fullscreen,
    }),
  );
  if (++samples >= 2) {
    collector.stop();
    clearTimeout(timeout);
    store.close();
    console.log('PASS: two live Win32 foreground samples reached sessions and current context');
  }
});
const timeout = setTimeout(() => {
  console.error(collector.status());
  collector.stop();
  store.close();
  process.exitCode = 1;
}, 25000);
collector.start();
