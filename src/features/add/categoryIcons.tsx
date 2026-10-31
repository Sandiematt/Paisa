import React from 'react';
import {Airplane} from 'phosphor-react-native/src/icons/Airplane';
import {ArrowCounterClockwise} from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import {Briefcase} from 'phosphor-react-native/src/icons/Briefcase';
import {Car} from 'phosphor-react-native/src/icons/Car';
import {DotsThree} from 'phosphor-react-native/src/icons/DotsThree';
import {ForkKnife} from 'phosphor-react-native/src/icons/ForkKnife';
import {GameController} from 'phosphor-react-native/src/icons/GameController';
import {GraduationCap} from 'phosphor-react-native/src/icons/GraduationCap';
import {Heart} from 'phosphor-react-native/src/icons/Heart';
import {House} from 'phosphor-react-native/src/icons/House';
import {Laptop} from 'phosphor-react-native/src/icons/Laptop';
import {Lightning} from 'phosphor-react-native/src/icons/Lightning';
import {Repeat} from 'phosphor-react-native/src/icons/Repeat';
import {ShoppingBag} from 'phosphor-react-native/src/icons/ShoppingBag';
import {ShoppingCart} from 'phosphor-react-native/src/icons/ShoppingCart';
import {Tag} from 'phosphor-react-native/src/icons/Tag';
import {User} from 'phosphor-react-native/src/icons/User';
import type {Icon as PhosphorIcon} from 'phosphor-react-native';

import {GradientIconSquare, GradientView} from '../../components/ui';
import {
  ColorScheme,
  GradientKey,
  colors,
  makeStyles,
  shadows,
  withAlpha,
} from '../../theme';
import {getActiveScheme} from '../../theme/colors';

/**
 * Category look shared across the app. One lookup, `categoryVisual`, maps a
 * category slug (or a free-form name) to a Phosphor icon plus a gradient, so
 * Activity rows, the Add grid and any other feature draw a category the same.
 *
 *   const {Icon, gradient, iconColor} = categoryVisual(row.categorySlug);
 */

type GradientSource = GradientKey | readonly string[];

export type CategoryVisual = {
  Icon: PhosphorIcon;
  /** Named DX gradient, or explicit stops for the variants the DX set lacks. */
  gradient: GradientSource;
  /**
   * Icon colour that reads on the gradient (`onAccent`, `ground` on mint and
   * gold, `text` on the neutral wash).
   */
  iconColor: string;
};

type Visuals = {
  byKey: Record<string, CategoryVisual>;
  fallback: CategoryVisual;
};

/**
 * Built from the live palette, so it runs once per scheme (on first use)
 * rather than at module load, which would freeze the boot scheme's colours.
 */
function buildVisuals(): Visuals {
  // Darker partner stops for the colours the DX gradient set has no pair for.
  const MINT_STOPS = [colors.mint, '#25A06A'] as const;
  const GOLD_STOPS = [colors.gold, '#B8862F'] as const;
  const VIOLET_STOPS = [colors.violet, colors.indigo] as const;
  const SKY_STOPS = [colors.sky, colors.violet] as const;
  const NEUTRAL_STOPS = [
    withAlpha(colors.text, 0.22),
    withAlpha(colors.text, 0.1),
  ] as const;

  const onAccent = colors.onAccent;
  const byKey: Record<string, CategoryVisual> = {
    housing: {Icon: House, gradient: VIOLET_STOPS, iconColor: onAccent},
    dining: {Icon: ForkKnife, gradient: 'rose', iconColor: onAccent},
    groceries: {Icon: ShoppingCart, gradient: 'primary', iconColor: onAccent},
    transport: {Icon: Car, gradient: 'savings', iconColor: onAccent},
    health: {Icon: Heart, gradient: 'rose', iconColor: onAccent},
    shopping: {Icon: ShoppingBag, gradient: SKY_STOPS, iconColor: onAccent},
    entertainment: {
      Icon: GameController,
      gradient: VIOLET_STOPS,
      iconColor: onAccent,
    },
    bills: {Icon: Lightning, gradient: GOLD_STOPS, iconColor: colors.ground},
    personal: {Icon: User, gradient: 'primary', iconColor: onAccent},
    education: {
      Icon: GraduationCap,
      gradient: 'savings',
      iconColor: onAccent,
    },
    travel: {Icon: Airplane, gradient: SKY_STOPS, iconColor: onAccent},
    subscriptions: {Icon: Repeat, gradient: 'primary', iconColor: onAccent},
    salary: {Icon: Briefcase, gradient: MINT_STOPS, iconColor: colors.ground},
    freelance: {Icon: Laptop, gradient: MINT_STOPS, iconColor: colors.ground},
    refund: {
      Icon: ArrowCounterClockwise,
      gradient: MINT_STOPS,
      iconColor: colors.ground,
    },
    // A wash of the text colour, so the glyph takes the text colour too.
    other: {Icon: DotsThree, gradient: NEUTRAL_STOPS, iconColor: colors.text},
  };

  return {
    byKey,
    fallback: {
      Icon: Tag,
      gradient: NEUTRAL_STOPS,
      iconColor: colors.text,
    },
  };
}

const visualsByScheme: Partial<Record<ColorScheme, Visuals>> = {};

function visuals(): Visuals {
  const scheme = getActiveScheme();
  let built = visualsByScheme[scheme];
  if (!built) {
    built = buildVisuals();
    visualsByScheme[scheme] = built;
  }
  return built;
}

/** Free-form names (custom categories, profile presets) to a known slug. */
const ALIASES: [RegExp, string][] = [
  [/(dining|food|restaurant|cafe|coffee|\beat)/, 'dining'],
  [/(grocer|supermarket|vegetable)/, 'groceries'],
  [/(transport|fuel|petrol|taxi|\bcab\b|metro|\bbus\b|commute|\bcar\b)/, 'transport'],
  [/(rent|home|house|housing|mortgage)/, 'housing'],
  [/(health|medical|doctor|pharmacy|fitness|gym)/, 'health'],
  [/(shop|cloth|fashion)/, 'shopping'],
  [/(entertain|movie|game|fun)/, 'entertainment'],
  [/(bill|utilit|electric|water|internet|phone)/, 'bills'],
  [/(subscri|membership)/, 'subscriptions'],
  [/(educat|school|course|tuition|book)/, 'education'],
  [/(travel|trip|flight|hotel|vacation)/, 'travel'],
  [/(salary|paycheck|wage|payroll)/, 'salary'],
  [/(freelanc|contract|gig)/, 'freelance'],
  [/(refund|cashback|reimburse)/, 'refund'],
  [/(personal|care|self)/, 'personal'],
];

export function categoryVisual(
  slugOrName?: string | null,
): CategoryVisual {
  const {byKey, fallback} = visuals();
  const key = slugOrName?.trim().toLowerCase();
  if (!key) {
    return byKey.other;
  }
  const direct = byKey[key];
  if (direct) {
    return direct;
  }
  const alias = ALIASES.find(([pattern]) => pattern.test(key));
  return alias ? byKey[alias[1]] : fallback;
}

type CategoryIconSquareProps = {
  /** Category slug or name. */
  id?: string | null;
  size?: number;
  glow?: boolean;
  iconSize?: number;
};

/** Gradient icon square for a category (34 rows, 40 grid tiles, ...). */
export function CategoryIconSquare({
  id,
  size = 38,
  glow = false,
  iconSize,
}: CategoryIconSquareProps) {
  const styles = useStyles();
  const {Icon, gradient, iconColor} = categoryVisual(id);
  const glyph = (
    <Icon
      size={iconSize ?? Math.round(size * 0.5)}
      color={iconColor}
      weight="fill"
    />
  );

  if (typeof gradient === 'string') {
    return (
      <GradientIconSquare size={size} gradient={gradient} glow={glow}>
        {glyph}
      </GradientIconSquare>
    );
  }

  return (
    <GradientView
      gradient={gradient}
      angle={140}
      style={[
        styles.square,
        {width: size, height: size, borderRadius: Math.round(size * 0.31)},
        glow ? shadows.iconGlow : null,
      ]}>
      {glyph}
    </GradientView>
  );
}

/** Kept for existing call sites: same square, `color` is ignored in DX. */
export function CategoryDisc({
  id,
  size = 38,
  iconSize,
}: {
  id: string;
  color?: string;
  size?: number;
  iconSize?: number;
}) {
  return <CategoryIconSquare id={id} size={size} iconSize={iconSize} />;
}

export function CategoryIcon({id, size = 20}: {id: string; size?: number}) {
  return <CategoryIconSquare id={id} size={40} iconSize={size} />;
}

const useStyles = makeStyles(() => ({
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
