# SonaRelay

<p align="center"><img src="assets/logo.svg" alt="SonaRelay" width="240"></p>

[Русский](#русский) · [English](#english)

## Русский

SonaRelay показывает текущую композицию Windows в компактном окне поверх других приложений и передаёт звук на сетевой ресивер. GSMTC предоставляет исполнителя, название и обложку. WASAPI Process Loopback захватывает PCM из дерева процессов исходного приложения.

### Запуск

Нужны Windows 11 x64, Node.js и npm. Из папки проекта в PowerShell выполните:

```powershell
npm.cmd ci
npm.cmd start
```

1. Включите музыку во внешнем Chrome, Edge, Firefox или другом Windows-приложении, которое публикует медиасеанс.
2. Для сетевой трансляции выберите интерфейс и ресивер в одной локальной сети. Поддерживаются DLNA, BluOS, Google Cast, AirPlay 2 и Squeezelite.
3. Управляйте треками в исходном приложении. В SonaRelay можно выбрать выход и отрегулировать его громкость.

SonaRelay выбирает воспроизводящий сеанс GSMTC с приоритетом для текущего сеанса Windows. Для трансляции программа должна однозначно определить дерево процессов источника. Захват включает звук одновременно играющих вкладок этого браузера. Локальное воспроизведение продолжается. Выход «Этот компьютер» управляет общей громкостью Windows.

### Last.fm

В разделе **Настройки → Last.fm** подключите аккаунт, подтвердите авторизацию в браузере и включите отображение текущего трека или скробблинг. Для скроббла нужны исполнитель, название, позиция и длительность трека. Для треков длиннее 30 секунд запись отправляется после половины трека или четырёх минут прослушивания, смотря что наступит раньше. Раздел показывает последнее действие, принятое Last.fm.

## English

SonaRelay is a compact, always-on-top Windows media panel. It displays the artist, track and artwork from GSMTC and relays PCM from the source process tree using WASAPI Process Loopback.

On Windows 11 x64, install Node.js and npm, then run `npm.cmd ci` and `npm.cmd start` in PowerShell from the project directory. Start music in an external browser or another Windows app that publishes a media session. Select a network interface and a receiver on your LAN to stream to DLNA, BluOS, Google Cast, AirPlay 2 or Squeezelite. Control the track in the source app and the output volume in SonaRelay.

Capture requires an identifiable source process tree and includes audio from other playing tabs in the same browser. Local playback continues. **This computer** controls Windows master volume.

Connect your account under **Settings → Last.fm** to show Now Playing or scrobble. Scrobbling requires an artist, title and usable playback position and duration. For tracks longer than 30 seconds, submission occurs after half the track or four minutes of listening, whichever is earlier.

## Разработка / Development

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

[Релизы и обновления / Releases and updates](RELEASE.md) · [История версий / Changelog](CHANGELOG.md) · [Лицензия / License](LICENSE)
