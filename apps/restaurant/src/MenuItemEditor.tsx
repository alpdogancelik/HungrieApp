import { FormEvent, useState } from "react";
import { supabase } from "./supabase";

type Ingredient = { name: string; removable: boolean };
type Option = { name: string; price: string };
type Group = { name: string; kind: "size" | "modifier" | "extra"; minimum: number; maximum: number; options: Option[] };

export function MenuItemEditor({ restaurantId, categoryId, reload, fail }: { restaurantId: string; categoryId: string; reload: () => Promise<void>; fail: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      let imageUrl = "";
      if (file) {
        if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Invalid media");
        const objectPath = `${restaurantId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const upload = await supabase.storage.from("restaurant-media").upload(objectPath, file, { contentType: file.type });
        if (upload.error) throw upload.error;
        imageUrl = supabase.storage.from("restaurant-media").getPublicUrl(objectPath).data.publicUrl;
      }
      const definition = {
        name, description, categoryId, priceKurus: String(Math.round(Number(price) * 100)), active: true, imageUrl,
        ingredients: ingredients.filter((item) => item.name.trim()).map((item, sortOrder) => ({ ...item, sortOrder })),
        groups: groups.map((group, sortOrder) => ({
          name: group.name, kind: group.kind, minimumSelections: group.minimum, maximumSelections: group.maximum, sortOrder,
          options: group.options.filter((item) => item.name.trim()).map((item, optionOrder) => ({ name: item.name, priceDeltaKurus: String(Math.round(Number(item.price) * 100)), sortOrder: optionOrder })),
        })),
      };
      const result = await supabase.rpc("restaurant_save_menu_item_v2" as any, { p_definition: definition, p_operation_id: crypto.randomUUID() });
      if (result.error) throw result.error;
      setName(""); setDescription(""); setFile(null); setIngredients([]); setGroups([]);
      await reload();
    } catch { fail(); }
  }

  return <form className="compact-form card-subsection" onSubmit={submit}>
    <div className="form-grid">
      <label className="field">Item / Ürün<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field">Price / Fiyat<input required min="0" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label className="field">Description / Açıklama<textarea maxLength={1500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="field">Image / Görsel<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
    </div>
    <fieldset><legend>Ingredients / Malzemeler</legend>
      {ingredients.map((ingredient, index) => <div className="row" key={index}>
        <input aria-label="Ingredient name" value={ingredient.name} onChange={(event) => setIngredients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} />
        <label><input type="checkbox" checked={ingredient.removable} onChange={(event) => setIngredients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, removable: event.target.checked } : item))} /> Removable / Çıkarılabilir</label>
        <button type="button" onClick={() => setIngredients((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove / Sil</button>
      </div>)}
      <button type="button" onClick={() => setIngredients((items) => [...items, { name: "", removable: false }])}>Add ingredient / Malzeme ekle</button>
    </fieldset>
    <fieldset><legend>Sizes, modifiers and extras / Boyut, seçenek ve ekstralar</legend>
      {groups.map((group, index) => <GroupEditor key={index} group={group} change={(next) => setGroups((items) => items.map((item, itemIndex) => itemIndex === index ? next : item))} remove={() => setGroups((items) => items.filter((_, itemIndex) => itemIndex !== index))} />)}
      <button type="button" onClick={() => setGroups((items) => [...items, { name: "", kind: "modifier", minimum: 0, maximum: 1, options: [] }])}>Add option group / Seçenek grubu ekle</button>
    </fieldset>
    <button className="button">Save item / Ürünü kaydet</button>
  </form>;
}

function GroupEditor({ group, change, remove }: { group: Group; change: (value: Group) => void; remove: () => void }) {
  return <section className="option-group"><div className="row">
    <input required aria-label="Group name" placeholder="Group / Grup" value={group.name} onChange={(event) => change({ ...group, name: event.target.value })} />
    <select aria-label="Group kind" value={group.kind} onChange={(event) => change({ ...group, kind: event.target.value as Group["kind"] })}><option value="size">Size / Boyut</option><option value="modifier">Modifier / Seçenek</option><option value="extra">Extra / Ekstra</option></select>
    <label>Min <input type="number" min="0" value={group.minimum} onChange={(event) => change({ ...group, minimum: Number(event.target.value) })} /></label>
    <label>Max <input type="number" min={group.minimum} value={group.maximum} onChange={(event) => change({ ...group, maximum: Number(event.target.value) })} /></label>
    <button type="button" onClick={remove}>Remove group / Grubu sil</button>
  </div>
    {group.options.map((option, index) => <div className="row" key={index}>
      <input required aria-label="Option name" placeholder="Option / Seçenek" value={option.name} onChange={(event) => change({ ...group, options: group.options.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} />
      <label>Price change / Fiyat farkı<input type="number" step="0.01" value={option.price} onChange={(event) => change({ ...group, options: group.options.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) })} /></label>
      <button type="button" onClick={() => change({ ...group, options: group.options.filter((_, itemIndex) => itemIndex !== index) })}>Remove / Sil</button>
    </div>)}
    <button type="button" onClick={() => change({ ...group, options: [...group.options, { name: "", price: "0" }] })}>Add option / Seçenek ekle</button>
  </section>;
}
