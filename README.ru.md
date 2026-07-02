![Header](header.png)

<div align="center">

# Firefox macOS External PiP

**Нативное поверх-всех-окон Picture-in-Picture для Firefox на macOS**

[![License](https://img.shields.io/badge/license-MIT-2C2C2C?style=for-the-badge&labelColor=1E1E1E)](LICENSE)
[![Firefox](https://img.shields.io/badge/firefox-extension-2C2C2C?style=for-the-badge&logo=firefox&labelColor=1E1E1E)]()
[![Electron](https://img.shields.io/badge/electron-helper-2C2C2C?style=for-the-badge&logo=electron&labelColor=1E1E1E)]()

</div>

Расширение для Firefox в связке с вспомогательным приложением на Electron, которое транслирует видео со страницы в окно поверх всех остальных на macOS — без захвата экрана. Предпочитает прямые медиа-URL для воспроизведения без накладных расходов, при необходимости переключается на `captureStream()` + `MediaRecorder` через локальный WebSocket для универсальной совместимости.

## ■ Возможности

- ❖ **Прямое воспроизведение медиа** — перехватывает URL `.m3u8`/`.mp4`/`.webm`/`.m4v` из `webRequest` и воспроизводит их нативно во вспомогательном приложении; HLS-потоки проходят через `hls.js`
- ❖ **Резервная трансляция** — захватывает исходный `<video>` через `captureStream()` и передаёт куски WebM из `MediaRecorder` через локальный WebSocket (`ws://127.0.0.1:41243/signaling`) в буфер `MediaSource`
- ❖ **Синхронизация воспроизведения** — зеркалирует play/pause, перемотку, текущее время и скорость воспроизведения между исходной вкладкой и окном PiP
- ❖ **Окно поверх всех** — безрамочная, перетаскиваемая и масштабируемая поверхность PiP, которая фиксирует соотношение сторон исходного видео и запоминает положение между запусками
- ❖ **Поддержка iframe** — проверяет каждый фрейм и оценивает кандидатов для нахождения лучшего воспроизводимого `<video>`
- ❖ **Элементы управления воспроизведением** — кнопки play/pause, громкость со слайдером, закрепление/открепление, закрытие, а также полоса перемотки/таймлайн; оверлей на исходной странице возвращает вас во вкладку
- ❖ **Готовность к AMO** — включает метаданные, политику конфиденциальности и примечания для рецензентов при отправке в Firefox Add-ons

## ■ Стек

<div align="center">

| Компонент | Технология |
|-----------|------------|
| Extension | WebExtensions API (Manifest v2) |
| Helper | Electron, ws (WebSocket), hls.js |
| Build | web-ext, electron-builder |
| Platforms | Firefox 142+, macOS (arm64 + x64) |

</div>

## ■ Запуск

```bash
# Install deps and run the Electron helper app
cd helper && npm install && npm start

# Build the extension (web-ext)
npm install
npm run firefox:build

# Lint, build the extension, and pack the macOS helper in one step
npm run release:local
```

Загрузите расширение через `about:debugging#/runtime/this-firefox` > Load Temporary Add-on > выберите `extension/manifest.json`.

## ■ Скриншоты

<div align="center">

![Screenshot](screenshots/main.png)

*Главное окно PiP с элементами управления воспроизведением поверх других приложений*

</div>

## ■ License

MIT © [pluttan](https://github.com/pluttan)
