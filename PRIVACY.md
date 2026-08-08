# Privacy — EAL Word Builder

## What stays on the device

Word Builder saves learning progress in the browser's `localStorage` so practice can continue offline. Depending on what the student uses, this can include:

- chosen display/home-language preference;
- words started and their subject/unit path;
- revision box, repetition count, lapses, current streak and mastered state;
- local activity timestamps used to calculate a practice streak;
- a student's typed prediction of a word meaning;
- locally logged learning and review actions.

Older builds could also log a student's typed language/list request and note locally. The current public build blocks those request submissions before they are logged or sent.

This data stays in that browser profile/device. Clearing site data removes it.

## What is not enabled

The public build has no working student account system or cloud progress sync. The Supabase module in the runtime is a local-only compatibility stub so older application code cannot connect to a backend. Email-request submission is also blocked in the public build.

## Future changes

Do not enable accounts, cloud sync, class identifiers, a teacher progress dashboard or another backend without an explicit privacy/governance decision first.
