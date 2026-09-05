# Finish confirmation and admin panel

## Outcome
- Replace the black booking-confirmation presentation with a visible ivory-and-champagne experience that cannot look blank while loading or animating.
- Complete the admin panel wiring so every existing admin screen opens and shares appointment data correctly.
- Verify the customer confirmation and admin access/navigation flows on desktop and mobile-sized layouts.

## Work
1. Restyle all confirmation states—loading, missing booking, reveal, and final details—using the existing salon palette and clear visible content from the first frame.
2. Preserve the confirmation actions: add to calendar, save confirmation, and return home.
3. Mount the admin data provider at the app root and fix any remaining route, typing, or interaction issues across Today, Calendar, Bookings, Clients, Menu, and Settings.
4. Run focused checks and browser-test direct confirmation access, a valid confirmation, admin unlock, and admin navigation.

## Technical details
- Keep bookings and admin changes stored on the current browser as already implemented; no cloud or login-system migration is included.
- Preserve the current customer booking flow and service/time rules.
