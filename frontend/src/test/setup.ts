import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// With `globals: false` testing-library cannot register its own afterEach,
// so the DOM of one test would leak into the next.
afterEach(cleanup)
