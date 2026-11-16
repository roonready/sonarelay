# SonaRelay

<p align="center"><img src="assets/logo.svg" alt="SonaRelay" width="240"></p>

[English](#english) · [Русский](#русский)

## English

SonaRelay is a Windows app for listening to internet radio and Yandex Music on your computer, network speaker, music player, or TV. Radio plays directly from the station's audio stream, without a browser or sign-in. Yandex Music remains available through its own button.

### Features

- Play **Наше Радио** and **Radio Calico** directly, with one button per station.
- Play through Windows audio output or a network receiver.
- Discover receivers supporting DLNA, BluOS, AirPlay 2, and Google Cast.
- Connect WiiM and other Squeezelite players without installing a separate LMS / Lyrion server.
- Keep streaming when switching tracks in Yandex Music.
- Scrobble to Last.fm after setup and account connection.

### Requirements

- A computer running Windows 11, 64-bit.
- Internet access. A Yandex Music account is needed only for Yandex Music; radio requires no account.
- For network playback, a compatible receiver on the same home network as your computer, connected by Wi-Fi or Ethernet.

Keep your computer switched on and SonaRelay running throughout playback.

### Installation

1. Download the SonaRelay Windows x64 installer from [GitHub Releases](https://github.com/roonready/sonarelay/releases) and run it. Its name is `SonaRelay-Setup-<version>-x64.exe`.
2. Choose an installation folder and complete the setup.
3. Open **SonaRelay** from the Start menu or desktop shortcut.

No additional playback software is required. The installer is currently unsigned, so Windows may display a publisher warning. Only run an installer from a source you trust.

Installed Windows versions check GitHub Releases for updates at startup. New versions download in the background; the **Updates** panel shows progress and offers **Restart and install** when ready. Installation starts only when you choose it. Stable installations receive stable updates only; beta builds can receive newer beta and stable versions. Older installers without the updater require a manual installation first.

For local builds and publishing, see [RELEASE.md](RELEASE.md). Version history is in [CHANGELOG.md](CHANGELOG.md). SonaRelay source code is licensed under [Apache License 2.0](LICENSE).

### Start listening

For radio, select **This computer (Windows)** or a network receiver, then press **Наше Радио** or **Radio Calico**. Press the same station again to stop. Choosing another station stops the previous one. The panel shows connecting, playing, stopped, or a connection error. Available station and track details appear automatically; metadata is optional.

Radio uses the Windows audio output for local playback; adjust its volume in Windows. Radio tracks with an artist and title can be sent to Last.fm after connecting your account. MusicBrainz is not used.

For Yandex Music:

1. Press **Яндекс Музыка**, sign in on the right, and play a track, album, or playlist.
2. To listen on your computer, leave **Receiver** set to **This computer (Windows)**.
3. To listen on a speaker or player, wait for discovery to finish and select it from the same list. Streaming starts automatically.
4. Allow a few seconds for the connection, especially with Google Cast receivers.

Choose tracks and playlists, pause, and resume using Yandex Music on the right. Your computer's local sound is muted during network streaming. Select **This computer (Windows)** to return audio to your computer.

Selecting another receiver automatically ends the previous stream. A device may appear more than once if it supports several connection methods; check the protocol beside its name.

### Interface language

SonaRelay supports English and Russian. On first launch it uses your Windows language, with English as the fallback for unsupported languages.

Change the language under **Settings → Language**. Your choice is saved on this computer and takes effect immediately. The embedded Yandex Music website controls its own language separately.

### Connecting receivers

#### DLNA and BluOS

Switch on your receiver and connect it to your home network. Enable DLNA / UPnP on the device if it has a separate setting. Select the receiver in SonaRelay once it appears.

DLNA streaming has been tested with **WiiM Pro**, and BluOS with **Bluesound PULSE FLEX 2i**. Compatibility with other models may vary.

#### AirPlay 2

Select a receiver marked **AirPlay 2**. Currently, only receivers allowing a connection without a PIN are supported. PIN entry, persistent pairing, and synchronized speaker groups are not supported yet.

Connection and data transmission have been tested with **Bluesound PULSE FLEX 2i**; audible output from the speaker still needs confirmation.

#### Google Cast

Select a receiver marked **Google Cast** and wait for playback to start. Audio uses MP3 at 320 kbps for compatibility. Playback has been tested with **Sony KDL-50W808C**; results may vary on other models.

#### WiiM / Squeezelite

1. Open WiiM Home and enable Squeezelite on your player.
2. Choose the **SonaRelay** server. If you need to enter an address manually, use the computer IP address shown in SonaRelay's left panel.
3. In SonaRelay, select the receiver marked **Squeezelite**.
4. Adjust volume in WiiM Home.

You do not need a separate LMS / Lyrion server. An existing server running on the same computer may interfere with SonaRelay's built-in server.

Connection and streaming have been tested with WiiM Pro; audible output still needs confirmation. LMS libraries and synchronized groups are not supported in this mode.

### Last.fm

Last.fm can add tracks you listen to to your profile. This is called scrobbling.

If Last.fm connection is available in your version, follow the steps below. If the connection button is unavailable and the app says Last.fm is not configured, contact the person who provided your build.

#### Connect your account

1. Open **Settings → Last.fm** in the left panel.
2. Click **Connect Last.fm** and allow access in your browser.
3. Return to SonaRelay and click **I allowed access**.
4. Enable the options you want:
   - **Enable Now Playing** — show what you are listening to on Last.fm.
   - **Enable scrobbling** — add listened tracks to your profile.

Click **Disconnect** to disconnect your account. You can also revoke the app's access in your Last.fm account settings.

Last.fm works with both Yandex Music and radio, on your computer and on network receivers. A track must be longer than 30 seconds; a scrobble is submitted after half the track or four minutes of listening, whichever comes first. Radio uses Last.fm's catalog duration when available, or four minutes of confirmed listening when the duration is unknown. Both artist and title are required. Stops, buffering and seeking do not count as listening time. Yandex Music requires an available duration and playback position for scrobbling.

The Last.fm settings show the last Now Playing update or scrobble accepted by the service, including the track and submission time.

Failed submissions are not saved for later delivery when you are offline or Last.fm is unavailable. Last.fm errors do not interrupt music playback.

### Troubleshooting

#### Your receiver does not appear

1. Make sure it is switched on and connected to the same home network as your computer.
2. In the left panel, choose the Wi-Fi or Ethernet connection your computer uses to reach the router.
3. Check that the devices are not on a guest Wi-Fi network with client isolation.
4. If you use a VPN, allow access to your local network.
5. Allow SonaRelay through Windows Firewall for private networks.
6. Retry discovery or wait for the list to refresh automatically.

DLNA discovery currently supports IPv4 receivers on the same local subnet. Devices on another subnet may not appear.

#### A receiver is selected, but there is no sound

- Check that a track is actually playing on the right.
- Check the receiver's volume and selected input. Use WiiM Home for Squeezelite volume.
- Wait for the connection to finish and check the left panel for errors.
- Select **This computer (Windows)** to check local playback, then select the network receiver again.
- After changing networks or connecting an Ethernet cable, select the network interface and receiver again.

#### Playback is delayed on the speaker

Network receivers buffer audio before playing it. Pauses, track changes, and other actions may therefore be heard with a delay, depending on the receiver and connection method.

### Audio quality and limitations

DLNA, BluOS, and Squeezelite use FLAC; AirPlay 2 uses ALAC at 44.1 kHz / 16-bit; Google Cast uses MP3 at 320 kbps. FLAC and ALAC transmit the audio received by the app without additional lossy compression. SonaRelay does not guarantee bit-perfect transmission of the original Yandex Music file.

Available track details depend on the music player. Updating track information on a DLNA receiver's display is not supported yet.

Your app profile is stored locally in `%APPDATA%\sonarelay`.

---

## Русский

SonaRelay — приложение для Windows, с которым можно слушать интернет-радио и Яндекс Музыку на компьютере, сетевой колонке, музыкальном плеере или телевизоре. Радио воспроизводится напрямую из аудиопотока без браузера и авторизации. Яндекс Музыка доступна по отдельной кнопке.

### Что умеет приложение

- Воспроизводить **«Наше Радио»** и **Radio Calico** напрямую — отдельной кнопкой для каждой станции.
- Воспроизводить музыку через аудиовыход Windows или сетевой приёмник.
- Находить устройства с поддержкой DLNA, BluOS, AirPlay 2 и Google Cast.
- Подключать WiiM и другие плееры с Squeezelite без отдельной установки музыкального сервера LMS / Lyrion.
- Продолжать трансляцию при переключении треков в Яндекс Музыке.
- Отправлять сведения о прослушиваниях в Last.fm после настройки и подключения аккаунта.

### Что понадобится

- Компьютер с Windows 11, 64-разрядная версия.
- Доступ к интернету. Аккаунт Яндекс Музыки нужен только для Яндекс Музыки; радио работает без аккаунта.
- Для сетевого воспроизведения — совместимый приёмник в той же домашней сети, что и компьютер. Подключение может быть по Wi-Fi или кабелю.

Компьютер должен оставаться включённым, а приложение — запущенным всё время прослушивания.

### Установка

1. Скачайте установщик SonaRelay для Windows x64 на странице [GitHub Releases](https://github.com/roonready/sonarelay/releases) и запустите его. Имя файла — `SonaRelay-Setup-<version>-x64.exe`.
2. Выберите папку установки и завершите установку.
3. Откройте **SonaRelay** через меню «Пуск» или ярлык на рабочем столе.

Дополнительные программы для воспроизведения устанавливать не нужно. Установщик пока не подписан цифровым сертификатом, поэтому Windows может показать предупреждение об издателе. Запускайте файл только из источника, которому доверяете.

Установленное приложение проверяет GitHub Releases при запуске и загружает новые версии в фоне. В блоке **«Обновления»** отображается прогресс и появляется кнопка **«Перезапустить и установить»**. Установка начинается только по вашему выбору. Stable получает только стабильные обновления; beta может получать новые beta и стабильные версии. Старые установщики без поддержки обновлений сначала нужно обновить вручную.

Локальная сборка и публикация описаны в [RELEASE.md](RELEASE.md), изменения версий — в [CHANGELOG.md](CHANGELOG.md). Исходный код SonaRelay распространяется по [Apache License 2.0](LICENSE).

### Как начать слушать

Для радио выберите **«Этот компьютер (Windows)»** или сетевой приёмник, затем нажмите **«Наше Радио»** либо **Radio Calico**. Повторное нажатие той же кнопки останавливает поток. Выбор другой станции завершает предыдущую трансляцию. Панель показывает подключение, воспроизведение, остановку или ошибку. Сведения о станции и композиции появляются при наличии метаданных; их отсутствие не мешает звуку.

При прослушивании радио на компьютере громкость регулируется в Windows. Композиции радио с известными исполнителем и названием можно отправлять в Last.fm после подключения аккаунта. MusicBrainz не используется.

Для Яндекс Музыки:

1. Нажмите **«Яндекс Музыка»**, войдите в аккаунт справа и включите композицию, альбом или плейлист.
2. Для прослушивания на компьютере оставьте в списке **«Приёмник»** вариант **«Этот компьютер (Windows)»**.
3. Для прослушивания на колонке или плеере дождитесь окончания поиска и выберите нужное устройство в том же списке. Передача звука начнётся автоматически.
4. Дождитесь подключения. На некоторых устройствах, особенно Google Cast, запуск может занять несколько секунд.

Треки, плейлисты, паузу и продолжение воспроизведения выбирайте в интерфейсе Яндекс Музыки справа. Во время сетевой трансляции звук на самом компьютере отключается. Чтобы вернуть его, выберите **«Этот компьютер (Windows)»**.

При выборе другого приёмника приложение автоматически завершает предыдущую трансляцию. Одно устройство может отображаться несколько раз, если оно поддерживает разные способы подключения: ориентируйтесь на пометку протокола рядом с названием.

### Язык интерфейса

SonaRelay поддерживает английский и русский языки. При первом запуске приложение выбирает язык Windows; если он не поддерживается, используется английский.

Изменить язык можно в **Settings → Language** / **Настройки → Язык**. Выбор сохраняется на этом компьютере и применяется сразу. Язык встроенного сайта Яндекс Музыки настраивается отдельно на самом сайте.

### Подключение устройств

#### DLNA и BluOS

Включите приёмник и подключите его к домашней сети. Если на устройстве есть отдельная настройка DLNA / UPnP, включите её. После обнаружения выберите приёмник в приложении.

Передача по DLNA проверена на **WiiM Pro**, а по BluOS — на **Bluesound PULSE FLEX 2i**. Совместимость других моделей может отличаться.

#### AirPlay 2

Выберите устройство с пометкой **AirPlay 2**. Пока поддерживаются приёмники, которые допускают подключение без ввода PIN-кода. Устройства, требующие код или постоянное сопряжение, а также синхронное воспроизведение на группе колонок пока не поддерживаются.

Подключение и передача данных проверены на **Bluesound PULSE FLEX 2i**; звучание непосредственно на колонке требует дополнительного подтверждения.

#### Google Cast

Выберите приёмник с пометкой **Google Cast** и дождитесь начала воспроизведения. Для совместимости звук передаётся в MP3 320 кбит/с. Работа проверена на **Sony KDL-50W808C**; на других моделях результат может отличаться.

#### WiiM / Squeezelite

1. Откройте WiiM Home и включите Squeezelite на плеере.
2. Выберите сервер **SonaRelay**. Если требуется ввести адрес вручную, укажите IP компьютера, показанный в левой панели SonaRelay.
3. В SonaRelay выберите приёмник с пометкой **Squeezelite**.
4. Регулируйте громкость в WiiM Home.

Отдельный сервер LMS / Lyrion устанавливать не требуется. Если он уже работает на этом компьютере, он может мешать подключению встроенного сервера SonaRelay.

На WiiM Pro проверены подключение и передача потока; звучание на аудиовыходе требует дополнительного подтверждения. Музыкальная библиотека LMS и синхронные группы в этом режиме не поддерживаются.

### Last.fm

Last.fm позволяет сохранять прослушанные композиции в вашем профиле — это называется скробблингом.

Если подключение Last.fm доступно в вашей версии приложения, свяжите свой аккаунт по инструкции ниже. Если кнопка подключения недоступна и приложение сообщает об отсутствии настройки, обратитесь к тому, кто предоставил сборку: поддержку Last.fm нужно подготовить на его стороне.

#### Подключение аккаунта

1. В левой панели откройте **Настройки → Last.fm**.
2. Нажмите **Connect Last.fm** и разрешите доступ в открывшемся браузере.
3. Вернитесь в SonaRelay и нажмите **«Я разрешил доступ»**.
4. Включите нужные параметры:
   - **Enable Now Playing** — показывать в Last.fm, что играет сейчас.
   - **Enable Scrobbling** — добавлять прослушанные композиции в профиль.

Для отключения нажмите **Disconnect**. При необходимости доступ приложения также можно отозвать в настройках аккаунта Last.fm.

Last.fm работает и с Яндекс Музыкой, и с радио — на компьютере и сетевых приёмниках. Трек должен быть длиннее 30 секунд; запись отправляется после прослушивания половины композиции или четырёх минут — в зависимости от того, что наступит раньше. Для радио используется длительность из каталога Last.fm; если она неизвестна, нужны четыре минуты подтверждённого прослушивания. Обязательны исполнитель и название. Остановки, буферизация и перемотка не засчитываются. Для скробблинга Яндекс Музыки нужны доступные длительность и позиция.

В настройках Last.fm показана последняя принятая сервисом отправка Now Playing или скроббла — с композицией и временем отправки.

При отсутствии интернета или ошибке Last.fm неотправленные прослушивания не сохраняются для отправки позже. Ошибки Last.fm не останавливают музыку.

### Если что-то не работает

#### Приёмник не появился в списке

1. Убедитесь, что он включён и находится в той же домашней сети, что и компьютер.
2. В левой панели выберите сетевое подключение компьютера — Wi-Fi или Ethernet, через которое он подключён к роутеру.
3. Проверьте, что устройства не подключены к гостевой Wi-Fi сети с изоляцией клиентов.
4. Если используете VPN, разрешите в нём доступ к локальной сети.
5. Разрешите SonaRelay в брандмауэре Windows для частной сети.
6. Повторите поиск или дождитесь автоматического обновления списка.

Для DLNA сейчас поддерживается поиск в одной локальной подсети по IPv4. Устройства в другой подсети могут не обнаружиться.

#### Устройство выбрано, но звука нет

- Проверьте, что композиция справа действительно воспроизводится.
- Проверьте громкость и выбранный вход на приёмнике. Для Squeezelite используйте WiiM Home.
- Дождитесь завершения подключения и посмотрите, нет ли сообщения об ошибке в левой панели.
- Выберите **«Этот компьютер (Windows)»**, проверьте звук, затем снова выберите сетевой приёмник.
- После смены Wi-Fi или подключения кабеля заново выберите сетевое подключение и приёмник.

#### В колонке музыка звучит с задержкой

Сетевые устройства накапливают небольшой запас звука перед воспроизведением. Поэтому пауза, смена трека и другие действия могут быть слышны с задержкой, которая зависит от приёмника и способа подключения.

### Качество звука и ограничения

Для DLNA, BluOS и Squeezelite используется FLAC, для AirPlay 2 — ALAC 44,1 кГц / 16 бит, для Google Cast — MP3 320 кбит/с. FLAC и ALAC передают полученный приложением звук без дополнительного сжатия с потерями. При этом приложение не гарантирует передачу исходного файла Яндекс Музыки без изменений (bit-perfect).

Доступность названия, исполнителя, обложки и других сведений зависит от музыкального плеера. Обновление информации о треке на экране DLNA-приёмника пока не поддерживается.

Данные профиля приложения хранятся на компьютере в `%APPDATA%\sonarelay`.
