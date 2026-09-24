Find A Place Booking - public photo presentation + gallery fix

What this fixes:
1. Mobile Featured Stay photos could become very tall because the tablet
   one-row grid definition was still inherited after the card collapsed to
   one column. Mobile now uses a stable 4:3 media area.
2. Property listing photos are no longer just a static 3-image preview.
   Any visible photo can be clicked.
3. The old non-clickable "12 photos" badge is now a clear
   "View all 12 photos" button.
4. A full-screen gallery opens with previous/next controls, keyboard arrows,
   Escape-to-close, and desktop thumbnail navigation.
5. On mobile the main property gallery stays 4:3 instead of becoming a tall
   fixed-height block.

No storage records, image ordering, upload behavior, booking flow, payment flow,
or tax logic are changed.
