import type {TabId} from '../NavBar/NavBar';

/** Elements a step can spotlight; each is registered with useTutorialTarget. */
export type TutorialTargetId =
  | 'home.balance'
  | 'home.totals'
  | 'home.limit'
  | 'home.goals'
  | 'home.profile'
  | 'home.notifications'
  | 'nav.add'
  | 'activity.search'
  | 'insights.period';

/** Each main screen has its own short tour, shown the first time it is opened. */
export type TutorialSection = TabId;

export const TUTORIAL_SECTIONS: readonly TutorialSection[] = [
  'home',
  'activity',
  'insights',
];

export type TutorialStep = {
  id: string;
  /** The screen this step belongs to; the tour never changes screens itself. */
  section: TutorialSection;
  /** What to highlight; null shows a centred card with no spotlight. */
  target: TutorialTargetId | null;
  title: string;
  body: string;
};

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    section: 'home',
    target: null,
    title: 'Welcome to Paisa',
    body: 'Here is a quick look at Home. Activity and Insights show their own short tips the first time you open them.',
  },
  {
    id: 'balance',
    section: 'home',
    target: 'home.balance',
    title: 'Your balance at a glance',
    body: 'See what you have left and how it changed. Switch between week, month and year, and pull down to sync.',
  },
  {
    id: 'totals',
    section: 'home',
    target: 'home.totals',
    title: 'Money in and out',
    body: 'Expense and Income add up everything you recorded in the period you picked above.',
  },
  // How the budget works, in small steps and simple words.
  {
    id: 'budget-how',
    section: 'home',
    target: null,
    title: 'How your budget works',
    body: 'Say you have ₹9,000 for the month. First, Paisa keeps aside your bills, like ₹5,000 for rent. Then it keeps aside your savings, like ₹2,000. The ₹2,000 left over is your spending money.',
  },
  {
    id: 'daily-limit',
    section: 'home',
    target: 'home.limit',
    title: 'Your daily limit',
    body: 'Paisa shares your spending money across the days left in the month. ₹2,000 for 30 days is about ₹66 a day. This line shows how much you can spend today.',
  },
  {
    id: 'daily-limit-changes',
    section: 'home',
    target: null,
    title: 'Spend less today, get more tomorrow',
    body: 'Spend only ₹40 of your ₹66 today, and the ₹26 left over is shared across the next days, so tomorrow you can spend a little more. Spend too much, and the next days get a little less.',
  },
  {
    id: 'goals',
    section: 'home',
    target: 'home.goals',
    title: 'Budget and savings',
    body: 'The budget circle shows how much of your spending money is used. Your savings stay safe. Any spending money left at the end of the month becomes extra savings.',
  },
  {
    id: 'profile',
    section: 'home',
    target: 'home.profile',
    title: 'Profile and settings',
    body: 'Tap your photo to set your currency, budget and savings goal, and to turn on reminders, app lock or auto-tracking. You can replay these tips there too.',
  },
  {
    id: 'notifications',
    section: 'home',
    target: 'home.notifications',
    title: 'Alerts',
    body: 'Budget alerts and reminders collect here, so nothing slips past you.',
  },
  {
    id: 'add',
    section: 'home',
    target: 'nav.add',
    title: 'Add a transaction',
    body: 'Tap + to add an expense or income. Or scan a receipt: Paisa reads the merchant, date, total and items for you to check before saving.',
  },
  {
    id: 'activity',
    section: 'activity',
    target: 'activity.search',
    title: 'Activity',
    body: 'Every transaction, day by day. Search by name or category, and swipe a row to edit, duplicate or delete it.',
  },
  {
    id: 'insights',
    section: 'insights',
    target: 'insights.period',
    title: 'Insights',
    body: 'Spending trends, top categories and an AI summary for the week, month or year.',
  },
];

export function stepsFor(section: TutorialSection): TutorialStep[] {
  return TUTORIAL_STEPS.filter(step => step.section === section);
}

export type Rect = {x: number; y: number; width: number; height: number};

/**
 * Where the tooltip card goes for a spotlight: below the target when it
 * fits, otherwise above, otherwise centred. Returns the card's top edge.
 */
export function placeCard(
  target: Rect | null,
  screenHeight: number,
  cardHeight: number,
  insets: {top: number; bottom: number},
  gap = 16,
): {top: number; placement: 'below' | 'above' | 'center'} {
  const minTop = insets.top + gap;
  const maxBottom = screenHeight - insets.bottom - gap;
  if (target) {
    const below = target.y + target.height + gap;
    if (below + cardHeight <= maxBottom) {
      return {top: below, placement: 'below'};
    }
    const above = target.y - gap - cardHeight;
    if (above >= minTop) {
      return {top: above, placement: 'above'};
    }
  }
  return {
    top: Math.max(minTop, (screenHeight - cardHeight) / 2),
    placement: 'center',
  };
}

/** A measured target worth spotlighting: on screen and not collapsed. */
export function visibleRect(
  rect: Rect | null,
  screen: {width: number; height: number},
): Rect | null {
  if (!rect || rect.width < 1 || rect.height < 1) {
    return null;
  }
  if (
    rect.y + rect.height <= 0 ||
    rect.y >= screen.height ||
    rect.x + rect.width <= 0 ||
    rect.x >= screen.width
  ) {
    return null;
  }
  return rect;
}
