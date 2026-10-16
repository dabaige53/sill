import { execFileSync } from 'node:child_process';
const run = (...arguments_: string[]) => execFileSync(process.execPath, arguments_, { stdio: 'inherit' });
run('scripts/build.ts', '--check');
run('--test', 'tests/web/core.test.ts', 'tests/web/build.test.ts');
console.log('Core checks passed; browser acceptance is separate.');
