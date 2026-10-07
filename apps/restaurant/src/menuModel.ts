import { formatKurusInput, parseKurus, type MenuItem, type MenuSnapshot } from "./managementContract.ts";

export type IngredientDraft = { id?: string; name: string; removable: boolean };
export type OptionDraft = { id?: string; name: string; price: string };
export type GroupDraft = { id?: string; name: string; kind: "size" | "modifier" | "extra"; minimum: number; maximum: number; options: OptionDraft[] };
export type MenuItemDraft = { id?: string; name: string; description: string; imageUrl: string; price: string; active: boolean; sortOrder: number; ingredients: IngredientDraft[]; groups: GroupDraft[] };
export const emptyMenuDraft = (): MenuItemDraft => ({ name: "", description: "", imageUrl: "", price: "0.00", active: true, sortOrder: 0, ingredients: [], groups: [] });

export function draftFromItem(item: MenuItem, snapshot: MenuSnapshot): MenuItemDraft {
  return { id: item.id, name: item.name, description: item.description, imageUrl: item.imageUrl || "", price: formatKurusInput(item.priceKurus), active: item.active, sortOrder: item.sortOrder,
    ingredients: snapshot.ingredients.filter(value => value.menuItemId === item.id).sort((a, b) => a.sortOrder - b.sortOrder).map(value => ({ id: value.id, name: value.name, removable: value.removable })),
    groups: snapshot.groups.filter(value => value.menuItemId === item.id).sort((a, b) => a.sortOrder - b.sortOrder).map(group => ({ id: group.id, name: group.name, kind: group.kind, minimum: group.minimumSelections, maximum: group.maximumSelections,
      options: snapshot.options.filter(value => value.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder).map(value => ({ id: value.id, name: value.name, price: formatKurusInput(value.priceDeltaKurus) })) })),
  };
}
export const normalizeMenuDraft = (draft: MenuItemDraft) => JSON.stringify({ ...draft, name: draft.name.trim(), description: draft.description.trim(), imageUrl: draft.imageUrl.trim(), ingredients: draft.ingredients.map(x => ({ ...x, name: x.name.trim() })), groups: draft.groups.map(g => ({ ...g, name: g.name.trim(), options: g.options.map(o => ({ ...o, name: o.name.trim() })) })) });
export function menuDefinition(draft: MenuItemDraft, categoryId: string, imageUrl = draft.imageUrl) {
  const priceKurus = parseKurus(draft.price); if (!draft.name.trim() || priceKurus === null) throw new Error("invalid");
  const ingredients = draft.ingredients.map((value, sortOrder) => { if (!value.name.trim() || value.name.trim().length > 120) throw new Error("invalid"); return { ...(value.id ? { id: value.id } : {}), name: value.name.trim(), removable: value.removable, sortOrder }; });
  const groups = draft.groups.map((group, sortOrder) => {
    if (!group.name.trim() || group.name.trim().length > 120 || !Number.isInteger(group.minimum) || !Number.isInteger(group.maximum) || group.minimum < 0 || group.maximum < 1 || group.minimum > group.maximum || group.options.length < group.maximum) throw new Error("invalid");
    const options = group.options.map((option, optionOrder) => { const priceDeltaKurus = parseKurus(option.price); if (!option.name.trim() || option.name.trim().length > 120 || priceDeltaKurus === null) throw new Error("invalid"); return { ...(option.id ? { id: option.id } : {}), name: option.name.trim(), priceDeltaKurus, sortOrder: optionOrder }; });
    return { ...(group.id ? { id: group.id } : {}), name: group.name.trim(), kind: group.kind, minimumSelections: group.minimum, maximumSelections: group.maximum, sortOrder, options };
  });
  return { ...(draft.id ? { id: draft.id } : {}), categoryId, name: draft.name.trim(), description: draft.description.trim(), imageUrl: imageUrl.trim(), priceKurus, active: draft.active, sortOrder: draft.sortOrder, ingredients, groups };
}

export function menuDefinitionReached(snapshot: MenuSnapshot, definition: ReturnType<typeof menuDefinition>, knownItemIds: ReadonlySet<string>) {
  const candidates = snapshot.items.filter(item => definition.id ? item.id === definition.id : !knownItemIds.has(item.id));
  return candidates.filter(item => {
    if (item.categoryId !== definition.categoryId || item.name !== definition.name || item.description !== definition.description || (item.imageUrl || "") !== definition.imageUrl || item.priceKurus !== definition.priceKurus || item.active !== definition.active || item.sortOrder !== definition.sortOrder) return false;
    const actualIngredients = snapshot.ingredients.filter(value => value.menuItemId === item.id).sort((a, b) => a.sortOrder - b.sortOrder);
    if (actualIngredients.length !== definition.ingredients.length || definition.ingredients.some((expected, index) => { const actual = actualIngredients[index]; return (expected.id !== undefined && expected.id !== actual.id) || expected.name !== actual.name || expected.removable !== actual.removable || expected.sortOrder !== actual.sortOrder; })) return false;
    const actualGroups = snapshot.groups.filter(value => value.menuItemId === item.id).sort((a, b) => a.sortOrder - b.sortOrder);
    if (actualGroups.length !== definition.groups.length) return false;
    return definition.groups.every((expectedGroup, groupIndex) => {
      const actualGroup = actualGroups[groupIndex];
      if ((expectedGroup.id !== undefined && expectedGroup.id !== actualGroup.id) || expectedGroup.name !== actualGroup.name || expectedGroup.kind !== actualGroup.kind || expectedGroup.minimumSelections !== actualGroup.minimumSelections || expectedGroup.maximumSelections !== actualGroup.maximumSelections || expectedGroup.sortOrder !== actualGroup.sortOrder) return false;
      const actualOptions = snapshot.options.filter(value => value.groupId === actualGroup.id).sort((a, b) => a.sortOrder - b.sortOrder);
      return actualOptions.length === expectedGroup.options.length && expectedGroup.options.every((expected, index) => { const actual = actualOptions[index]; return (expected.id === undefined || expected.id === actual.id) && expected.name === actual.name && expected.priceDeltaKurus === actual.priceDeltaKurus && expected.sortOrder === actual.sortOrder; });
    });
  }).length === 1;
}
