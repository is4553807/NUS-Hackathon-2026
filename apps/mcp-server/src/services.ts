import {
  checkInventory,
  createOrder,
  getPaymentStatus,
  getPublicProduct,
  initiatePayment,
  requestOffers,
  searchProducts,
} from "@visa-commerce/commerce";

export const defaultCommerceMcpServices = {
  checkInventory,
  createOrder,
  getPaymentStatus,
  getPublicProduct,
  initiatePayment,
  requestOffers,
  searchProducts,
};

export type CommerceMcpServices = typeof defaultCommerceMcpServices;
