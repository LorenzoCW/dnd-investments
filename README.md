# DnD Investments - A Kanban Finance App

A small **Kanban** focused on monetary values (balances and projections) with drag & drop powered by `@dnd-kit`. The project is written in **React + TypeScript** and structured into reusable components. The app supports connecting to a Firestore backend and includes a **test mode** that runs fully in-memory when the backend is not available.

## Key features

* Drag & drop and ordering of columns and cards using `@dnd-kit`.
* Support for mouse, touch and keyboard (KeyboardSensor with a custom `coordinateGetter`).
* Drag overlay and accessibility announcements for screen readers.
* CRUD for columns and cards with local fallback when the backend is unreachable.
* Partial transfer of amounts between cards (splits the original card when transferring a portion).
* Creation of monthly projections (splits a total value into monthly installments and creates projection cards).
* Currency input parsing (`parseCurrencyInput` accepts `1.234,56`, `1234.56`, `1234,56`, etc.).

## Technologies

* React + TypeScript
* @dnd-kit (core, sortable, utilities)
* Tailwind CSS
* Lucide icons
* Small internal UI components (Card, Button, ScrollArea, Badge)
* Backend abstraction: `src/lib/db` (can be Firestore, Realtime DB, or any realtime persistence)



## Getting started (development)

1. Clone the repository:

```bash
git clone <repo-url>
cd <repo>
```

2. Install dependencies:

```bash
npm install
# or
pnpm install
# or
yarn
```

3. Configure environment variables (optional, if using Firebase):

Create a `.env` (or `.env.local`) with entries like:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

4. Run development server:

```bash
npm run dev
# or pnpm dev
```

The app will attempt to subscribe via `../lib/db`. If the connection fails it will automatically enter **test mode** and work in-memory (a visual warning is shown at the top).

## Some other things

* **Test mode**: when the backend is unreachable the app enters test mode (in-memory) so the user can continue using the UI. Data is not persisted.
* **Currency parsing**: `parseCurrencyInput` accepts both `.` and `,` as decimal separators and detects thousands separators; results are limited to two decimal places.
* **Projections**: creating a projection divides the total across months (the last installment absorbs cent differences) and adds cards marked as projection. This is like a goal to set.
* **Partial transfers**: transferring part of a card reduces the original value; if it reaches zero the original card is removed; a new card is created in the destination with the transferred amount.
* **Accessibility**: uses `Announcements` from `@dnd-kit` to announce drag & drop events to assistive technologies.
* **Keyboard support**: uses `KeyboardSensor` with a custom `coordinateGetter` to allow keyboard movement of items.

## How to test without Firebase

If you don't want to configure a backend, keep `src/lib/db` pointing to an implementation that throws when subscribing — `KanbanBoard` will detect the error and switch to test mode automatically.

## License

Distributed under the MIT License.