# Paddl

A pickleball open-play queue manager. Runs in any browser on phone, tablet or desktop, works offline once loaded, and keeps everything on the device (no accounts, no server).

## Features
- **Formats:** doubles (rotating partners), singles, fixed teams.
- **Matching modes:**
  - *Fair rotation*: fewest games play first, avoids repeat partners and opponents.
  - *Winners stay*: winners hold the court up to a set number of wins in a row.
  - *Skill balanced*: builds even teams from player levels (2.0 to 5.5).
  - *Round robin*: spreads partners and opponents as evenly as possible.
- **Multiple courts**, add or remove courts mid-session.
- **Loophole handling:** fair byes, late joiners start at the average games played, breaks and leaving (a substitute is swapped in), score validation (win by 2, caps), no-contest and cancel, edit or delete any game, undo.
- **End of session:** final standings, games participation (played vs sat out), best duo, hot streak, biggest win and full match history, with a **Save image** button (and Share on phones).
- Past sessions and a remembered roster of regulars.

## Develop
```
npm install
npm run dev      # local dev server
npm test         # engine tests
npm run build    # type check + production build into dist/
```

The app is a static site, so `dist/` can be hosted anywhere (GitHub Pages, Netlify, etc.).
