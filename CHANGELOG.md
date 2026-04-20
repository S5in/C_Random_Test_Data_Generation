# Change Log

All notable changes to the "voidwalker" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [3.0.0] — 2026-04-20
### Added
- **Header file (`.h`) parsing** — The extension can now parse `.h` header files to extract function declarations/prototypes and generate tests from them, not just `.c` source files.
- **VS Code Marketplace CI/CD publish pipeline** — Added GitHub Actions workflow (`.github/workflows/publish.yml`) for automated packaging and publishing via `vsce` on every GitHub release.
### Changed
- **Rebranded to Voidwalker** — Extension renamed from "S5in C BVA Test Generator" to "Voidwalker". Updated extension name, command IDs (`voidwalker.*`), configuration keys (`voidwalker.*`), output channel name, diagnostic source, and all documentation.
- **Version bumped to 3.0.0.**
- **Updated keywords and categories** for better Marketplace discoverability (`categories`: Testing, Other; expanded `keywords` list).

## [2.0.2] — 2026-03-24
### Added
- **Check Prerequisites command** — new `C Test Generator: Check Prerequisites` command verifies g++, CMake ≥ 3.14, and GTest are installed; shows install instructions if anything is missing.
- **Silent startup check** — prerequisite check runs automatically on activation and logs warnings to the Output Channel without interrupting the user.
### Fixed
- **Command IDs** — renamed from `random-test-data-generation.*` to `s5in-c-bva-test-generator.*` to match the publisher name in `package.json`.
- **WASM grammar loading** — pass the file path string directly to `Language.load()` instead of reading the file as a Buffer first; added descriptive error message on failure.

## [2.0.1] — 2026-03-23
### Fixed
- **Automatic `main()` conflict resolution** — When the user's `.c` file contains a `main()` function,
  the extension now automatically renames it via `-Dmain=__original_main` in the generated CMake
  configuration. This prevents the user's `main()` from conflicting with GoogleTest's `main()` entry
  point (`GTest::Main`). The user's source file is never modified — the rename happens at the
  preprocessor level for the C source compilation unit only.
## [2.0.0] — 2026-03-23
### Added — Goal 1: Support more C data types
- **Pointer parameters** (`int *ptr`, `float *arr`) — parser now includes the `*` in the extracted
  type (e.g. `type = "int *"`) and the test generator emits proper `NULL` and valid-pointer test cases
  (with a helper pre-declaration).
- **Array parameters** (`int arr[]`, `int arr[10]`) — parser extracts `int[]` / `int[10]` types and
  the generator emits single-element and typical-size array declarations.
- **Struct parameters** (`struct Point p`) — already parsed correctly in v1; generator now emits
  zero-initialized and extreme-field-values boundary test cases.
- New file `src/parser/structExtractor.ts` — extracts struct definitions from C source files.
- New `StructInfo` interface in `src/types.ts`.

### Added — Goal 2: Smarter boundary value generation
- **`size_t` type** added to the boundary catalog with boundaries `0`, `1`, `10`, `SIZE_MAX`.
- **Improved `char` boundaries**: added `null-terminator` (`'\0'`) and `printable` (`'A'`) boundary classes.
- **Float/double infinity** test cases: `positive-infinity` and `negative-infinity` boundary classes
  using `std::numeric_limits<T>::infinity()`.
- **Overflow/underflow** boundary class added for integer types.
- Fixed float/double assertion macros: `EXPECT_FLOAT_EQ` for `float` return types,
  `EXPECT_DOUBLE_EQ` for `double`.
### Added — Goal 3: Multiple test case generation
- **`cTestGenerator.testDensity` VS Code setting** — three levels:
  - `minimal` — min, max, zero only (fewest tests)
  - `standard` — min, min+1, max-1, max BVA (default, same as v1 behaviour)
  - `exhaustive` — all boundary classes including near-zero, infinities, overflow
- Extra combination tests: `Combination_AllTypical` and `Combination_MixedMinMax` (alternating
  min/max across parameters).
### Added — Goal 4: Improved UI with test preview panel
- **Preview tab** in the webview — shows the full generated `.cpp` test code with basic syntax
  highlighting (keywords, types, comments, preprocessor directives, numbers).
- **Checkboxes** next to every boundary test case — uncheck a test to have it commented out in the
  saved file rather than included.
- **Test count summary** in the webview header — shows "Tests generated / Selected / Custom".
### Added — Goal 5: Better error reporting and diagnostics
- `vscode.languages.createDiagnosticCollection('c-test-generator')` — build errors from g++/cmake
  stderr are parsed and surfaced in the VS Code **Problems panel** with correct file, line, and
  column information.
- Dedicated **"C Test Generator" Output Channel** — all extension log messages are now routed through
  `buildRunner.log()` instead of `console.log`, so they appear in the Output panel.
- More specific error message when cursor is not inside a function:
  _"Place your cursor inside a C function body and try again."_
### Changed
- Version bumped from `1.0.0` to `2.0.0`.
- Generated test files now include `<cstddef>` and `<limits>` headers for the new types.
- Header comment updated to `AUTO-GENERATED by C Test Generator v2.0.0`.
## [1.0.0] — Initial release
- Tree-sitter based C function parser.
- Google Test `.cpp` generation with `extern "C"` wrapping.
- Boundary value analysis for primitive types (`int`, `float`, `double`, `char`, and variants).
- Global variable detection and fixture-based test generation.
- Auto-generated `CMakeLists.txt`.
- Webview UI for expected values and custom tests.
- Build & Run support from VS Code.