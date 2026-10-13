# Third-party software in SomeScript Desktop

This file ships inside the app (Resources/THIRD_PARTY_LICENSES.md). Facts below were checked against
the upstream sources named here; `binaries/SOURCES.txt` records the exact versions and checksums of the
bundled programs for each build.

## Bundled programs (run as separate processes)

### Tectonic 0.17.0 — MIT

<https://github.com/tectonic-typesetting/tectonic>, official release binary, checksum-verified.
Tectonic's own license states that it is MIT-licensed and that the TeX system elements it derives from
are under a wide variety of open-source licenses. Its license text:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction, including
> without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
> following conditions: The above copyright notice and this permission notice shall be included in all copies
> or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND ...

Full text: <https://github.com/tectonic-typesetting/tectonic/blob/master/LICENSE>.
LaTeX packages are downloaded on demand from Tectonic's bundle server and carry their own licenses.

### SyncTeX — MIT

Copyright (c) 2008-2024 Jérôme Laurens. <https://github.com/jlaurens/synctex>, built from the commit
recorded in `binaries/SOURCES.txt`. License: <https://github.com/jlaurens/synctex/blob/master/LICENSE>.

## Fonts (in the Starter template)

See `templates/starter/Fonts/NOTICE.md`: CMU Serif is SIL OFL 1.1; TH Sarabun New is GPL v2+ with the
font exception.

## Rust and JavaScript dependencies

Listed with their licenses by `cargo about` / `bun pm ls`. TODO before the first public release: generate
and append the full list here.
