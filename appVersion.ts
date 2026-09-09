// Plain major.minor.patch comparison for the force-update gate
// (UpdateRequiredScreen.tsx, AppFlow.tsx). Not a general semver parser -
// this app's own version strings (app.json's `version`, and the backend's
// MIN_APP_VERSION env var) are always plain "x.y.z", never pre-release/build
// metadata suffixes, so a full semver library would be solving a problem
// this app doesn't have.
function parse(version: string): [number, number, number] {
  const parts = version.split('.').map((p) => parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// True if `current` is strictly older than `minimum` - the only direction
// the force-update gate cares about (equal or newer both mean "fine").
export function isVersionBelow(current: string, minimum: string): boolean {
  const a = parse(current);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
