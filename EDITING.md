# Добавление карточек

Все карточки находятся в `data/knowledge.js` внутри массива `window.KNOWLEDGE`.

Пример безопасной карточки:

```js
{
  id: 'unique-id',
  section: 'content', // contacts | content | money
  title: 'Название',
  subtitle: 'Короткое описание',
  tags: ['тег 1', 'тег 2'],
  status: 'safe', // safe | caution | blocked
  summary: 'Краткая суть материала.',
  checklist: [
    'Шаг или правило 1',
    'Шаг или правило 2'
  ],
  sources: [1, 2]
}
```

Дополнительные поля интерфейса задаются в `window.CARD_META` ниже массива:

```js
'unique-id': {
  type: 'Справочник',
  useWhen: 'Когда этот материал нужен',
  updated: '2026-09-26',
  pinned: true
}
```

## Поиск

Синонимы находятся в `window.SEARCH_SYNONYMS`. Например:

```js
'telegram': ['телеграм', 'тг', 'tg']
```

Это позволяет искать один материал разными формулировками.
