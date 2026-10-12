// The subprocess mocks only Kit's server-only build marker. No Kit runtime API
// is consumed by this Bun/Nest integration fixture; real builds test the guard.
declare module "$app/server" {}
