/** Types generated from the API's OpenAPI document by `pnpm openapi`; never edit by hand. */
export type { components, operations, paths } from './generated/openapi.js';
export { createApiClient, type ApiClient, type ApiClientOptions } from './client.js';
export {
  createDinerSocket,
  createStaffSocket,
  type DinerSocket,
  type EventEnvelope,
  type StaffSocket,
} from './events.js';
