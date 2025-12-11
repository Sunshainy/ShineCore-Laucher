# NeoForge Loader

Эта папка предназначена для будущей реализации загрузчика NeoForge.

## Планируемая структура:

- `NeoForgeDownloader.js` - основной класс загрузчика NeoForge
- `NeoForgeInstaller.js` - установщик NeoForge
- `NeoForgeVersions.js` - управление версиями NeoForge

## Базовый API NeoForge:

- API версий: `https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml`
- Загрузка: `https://maven.neoforged.net/releases/net/neoforged/neoforge/{version}/neoforge-{version}-installer.jar`

## Примечания:

NeoForge - это форк Forge, созданный после изменений в Minecraft Forge.
Поддерживает Minecraft 1.20+
