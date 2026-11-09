// Facade: real Admin adapter when Shopify Admin is configured, otherwise the in-memory mock.
import { flags } from '../env.js';
import * as real from './shopify-real.js';
import * as mock from './shopify-mock.js';

const impl = flags.hasShopifyAdmin ? real : mock;

export const isMock = !flags.hasShopifyAdmin;

export const findGroupByMerchantCode = (...a) => impl.findGroupByMerchantCode(...a);
export const createSellingPlanGroup = (...a) => impl.createSellingPlanGroup(...a);
export const attachProducts = (...a) => impl.attachProducts(...a);
export const getContract = (...a) => impl.getContract(...a);
export const updateLinePrices = (...a) => impl.updateLinePrices(...a);
export const createBillingAttempt = (...a) => impl.createBillingAttempt(...a);
export const pauseContract = (...a) => impl.pauseContract(...a);
export const activateContract = (...a) => impl.activateContract(...a);
export const cancelContract = (...a) => impl.cancelContract(...a);
export const skipNextCycle = (...a) => impl.skipNextCycle(...a);
export const setCadence = (...a) => impl.setCadence(...a);
export const normalizeContract = real.normalizeContract;

/** Mock-only helpers (no-ops / undefined in real mode). */
export const __reset = mock.__reset;
export const __seedContract = mock.__seedContract;
export const __forceFailure = mock.__forceFailure;
export const _calls = mock._calls;
