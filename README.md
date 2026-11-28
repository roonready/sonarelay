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

### Audio Scrobbler

Запустите локальный API и в SonaRelay откройте **Настройки → Audio Scrobbler**. Если сервер запущен на этом же компьютере, оставьте адрес `http://127.0.0.1:3000`. Для сервера на другом компьютере в доверенной локальной сети укажите адрес сайта, например `http://192.168.1.14:5173`. Введите токен устройства и включите отправку. При сбое сервиса события сохраняются в очереди. Если токен отозван, введите новый токен для того же пользователя, чтобы продолжить доставку.

Статус «Сейчас играет» отправляется при начале или смене трека и обновляется раз в минуту. Пауза, остановка или закрытие SonaRelay очищают статус. Возобновление воспроизведения создаёт новый ID статуса. При старте SonaRelay также передаёт метаданные альбома и pHash, чтобы Audio Scrobbler подобрал обложку или запросил её загрузку ещё до скроббла.

Чтобы исправить адрес, введите правильный URL и токен, нажмите «Сохранить» и подтвердите перенос ожидающих скробблов. Незавершённые загрузки обложек для скробблов, уже принятых прежним сервером, останавливаются.

Для JPEG, PNG и WebP из Windows GSMTC SonaRelay вычисляет pHash версии 1 и отправляет дескриптор вместе со скробблом. Байты обложки загружаются только по ответу `upload`. Скробблы в очереди сохраняются на диске, а ожидающие обложки хранятся только в памяти до закрытия приложения. При сбое S3 клиент повторяет PUT для принятого скроббла.

### Last.fm

В разделе **Настройки → Last.fm** подключите аккаунт, подтвердите авторизацию в браузере и включите отображение текущего трека или скробблинг. Для скроббла нужны исполнитель и название. Для треков длиннее 30 секунд запись отправляется после половины трека или двух минут прослушивания, смотря что наступит раньше. При неизвестной длительности порог составляет две минуты. Если позиция тоже неизвестна, SonaRelay считает время по отметкам Windows о воспроизведении. Раздел показывает последнее действие, принятое Last.fm.

## English

SonaRelay is a compact, always-on-top Windows media panel. It displays the artist, track and artwork from GSMTC and relays PCM from the source process tree using WASAPI Process Loopback.

On Windows 11 x64, install Node.js and npm, then run `npm.cmd ci` and `npm.cmd start` in PowerShell from the project directory. Start music in an external browser or another Windows app that publishes a media session. Select a network interface and a receiver on your LAN to stream to DLNA, BluOS, Google Cast, AirPlay 2 or Squeezelite. Control the track in the source app and the output volume in SonaRelay.

Capture requires an identifiable source process tree and includes audio from other playing tabs in the same browser. Local playback continues. **This computer** controls Windows master volume.

Connect your account under **Settings → Last.fm** to show Now Playing or scrobble. Scrobbling requires an artist and title. For tracks longer than 30 seconds, SonaRelay submits after half the track or two minutes of listening, whichever is earlier. When duration is unknown, the threshold is two minutes. If position is also unavailable, SonaRelay counts time from Windows playback status samples.

## Разработка / Development

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

[Релизы и обновления / Releases and updates](RELEASE.md) · [История версий / Changelog](CHANGELOG.md) · [Лицензия / License](LICENSE)
