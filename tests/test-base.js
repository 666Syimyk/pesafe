// The dedicated test server also mocks Service Worker cache fetches.
// Production modules contain no test hooks; tests never open a real phone app.
export { test, expect } from '@playwright/test';
