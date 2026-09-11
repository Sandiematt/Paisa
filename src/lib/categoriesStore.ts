import {supabase} from './supabase/client';
import {MoneyFlow} from './supabase/database.types';
import {dataErrorMessage} from './supabase/errors';

export type CategoryRow = {
  id: string;
  userId: string | null;
  name: string;
  icon: string;
  color: string;
  type: MoneyFlow;
  slug: string | null;
};

export async function loadCategories(): Promise<CategoryRow[]> {
  const {data, error} = await supabase
    .from('categories')
    .select('id, user_id, name, icon, color, type, slug')
    .order('name');

  if (error) {
    throw new Error(dataErrorMessage(error));
  }

  return (data ?? []).map(row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    type: row.type,
    slug: row.slug,
  }));
}

export function categoryForSlug(
  categories: CategoryRow[],
  slug: string,
  type: MoneyFlow,
): CategoryRow | undefined {
  return (
    categories.find(
      item => item.slug === slug && item.type === type && item.userId === null,
    ) ?? categories.find(item => item.slug === slug && item.type === type)
  );
}
