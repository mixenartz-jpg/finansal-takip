"use client";

import { useState } from "react";
import type { Category, CategoryKind, CategoryPatch } from "./types";
import { validateCategory, parseKeywords } from "./types";
import { Button, Field, Input, Select } from "@/components/ui";

interface CategoryEditFormProps {
  category: Category;
  saving: boolean;
  onSave: (patch: CategoryPatch) => void;
  onCancel: () => void;
}

export function CategoryEditForm({
  category,
  saving,
  onSave,
  onCancel,
}: CategoryEditFormProps) {
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState<CategoryKind>(category.kind);
  const [keywordText, setKeywordText] = useState(category.keywords.join(", "));
  const [touched, setTouched] = useState(false);

  const keywords = parseKeywords(keywordText);
  const validation = validateCategory({ name, kind, keywords });
  const err = (field: "name" | "kind") =>
    touched ? (validation.errors[field] ?? null) : null;

  function handleSubmit() {
    setTouched(true);
    if (!validation.valid) return;
    onSave({ name: name.trim(), kind, keywords });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Kategori adı" htmlFor="cat-name" error={err("name")}>
        <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      {/*
        Tür, kategori kullanımdaysa veritabanında KİLİTLİ
        (`categories_check_kind_immutable`, 0010). Alanı burada
        karartmak için her kategorinin kullanım sayısını çekmek
        gerekirdi — nadiren açılan bir form için gereksiz sorgu.
        Bunun yerine kural önceden yazılıyor; kullanıcı yine de
        denerse sayfa trigger'ın Türkçe hatasını gösteriyor.
      */}
      <Field
        label="Tür"
        htmlFor="cat-kind"
        error={err("kind")}
        hint="Kategoriye bağlı kayıt varsa tür değiştirilemez."
      >
        <Select
          id="cat-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as CategoryKind)}
        >
          <option value="expense">Gider</option>
          <option value="income">Gelir</option>
        </Select>
      </Field>

      {/*
        Önizleme satırı önemli: `parseKeywords` girdiyi
        normalleştiriyor ("Süt" → "sut"). Kullanıcı yazdığından
        farklı bir şeyin kaydedildiğini GÖRMELİ, yoksa kaydedip
        sonra listede başka bir şey bulmak kafa karıştırır.
      */}
      <Field
        label="Anahtar kelimeler"
        htmlFor="cat-keywords"
        hint="Virgülle ayırın. Sesli girişte bu kelimeler bu kategoriye eşlenir."
      >
        <Input
          id="cat-keywords"
          value={keywordText}
          onChange={(e) => setKeywordText(e.target.value)}
          placeholder="migros, bim, market"
        />
        {keywords.length > 0 && (
          <p className="text-[13px] text-[var(--ink-3)]">
            {keywords.length} kelime kaydedilecek: {keywords.join(" · ")}
          </p>
        )}
      </Field>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={handleSubmit} loading={saving} full>
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
