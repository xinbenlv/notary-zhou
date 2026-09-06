declare namespace App {
  interface Locals {
    notaryListing?: ReturnType<typeof import('./lib/notary-public-listing.mjs').createNotaryListingService>;
  }
}
