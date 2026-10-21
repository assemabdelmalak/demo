import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's own scales. Unregistered, `text-small` reads as a text
 * colour and silently replaces `text-on-primary` (or the reverse), and `rounded-button` competes
 * with nothing. These are the tokens from styles/tokens.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['caption', 'small', 'body', 'dish', 'title', 'display'] }],
      rounded: [{ rounded: ['sheet', 'image', 'button', 'chip', 'input', 'allergen'] }],
    },
  },
});

/** shadcn's class merger: later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
