# Minecraft Title Generator — Local Legacy

Load `minecraft_title_generator.js` through Blockbench desktop → File → Plugins → Load Plugin from File. Reload an already-loaded copy after updating.

Data comes directly from `D:/Downloads/MinecraftTitleGenerator-legacy/MinecraftTitleGenerator-legacy`: fonts.json, shapes.json, tileables.json, character/model JSON, textures, overlays and thumbnails. No GitHub/CDN asset source or remote usage-statistics request is used. Website/credit links remain ordinary links.

Blockbench may ask for permission to read this project folder. Allow folder access for the plugin. If the project moves, update `localDataDirectory` near the beginning of the plugin and reload it.

When models change, compile them with the project's scripts/compile.bat to update characters.json. Editing texture PNGs only requires a plugin reload to clear image caches.
