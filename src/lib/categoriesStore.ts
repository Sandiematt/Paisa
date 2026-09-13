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

export function categoryByName(
  categories: CategoryRow[],
  name: string,
  type: MoneyFlow,
): CategoryRow | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  return (
    categories.find(
      item => item.type === type && item.name.trim().toLowerCase() === needle,
    ) ?? undefined
  );
}

export async function findOrCreateUserCategory(
  name: string,
  type: MoneyFlow,
): Promise<CategoryRow> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Enter a category name.');
  }

  const existing = categoryByName(await loadCategories(), trimmed, type);
  if (existing) {
    return existing;
  }

  const {data: sessionData, error: sessionError} =
    await supabase.auth.getUser();
  if (sessionError || !sessionData.user) {
    throw new Error('Sign in to save a custom category.');
  }

  const {data, error} = await supabase
    .from('categories')
    .insert({
      user_id: sessionData.user.id,
      name: trimmed,
      icon: 'tag',
      color: '#8E887A',
      type,
    })
    .select('id, user_id, name, icon, color, type, slug')
    .single();

  if (error || !data) {
    const retry = categoryByName(await loadCategories(), trimmed, type);
    if (retry) {
      return retry;
    }
    throw new Error(dataErrorMessage(error));
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    icon: data.icon,
    color: data.color,
    type: data.type,
    slug: data.slug,
  };
}
