# Manual tax-data review

No tax rate is changed automatically by this package.

During the production audit, these current host-certified properties were found:

- `cedar-valley-resort-llc`
- `the-cypress-cabin`

Both are Mammoth Spring / Fulton County, Arkansas, and both currently have a
custom line:

`City + county sales tax` = **11.50%**

The application separately adds the configured statewide Arkansas rules:

- Arkansas state sales tax = **6.50%**
- Arkansas tourism tax = **2.00%**

So those three configured lines total **20.00 percentage points** before any
other applicable tax.

That 11.50% custom value should be manually confirmed as a *local-only* rate
before unrestricted live bookings. The hardening migration deliberately does
not make financial/tax-rate assumptions or rewrite host-entered tax data.
