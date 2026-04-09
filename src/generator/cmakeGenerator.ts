/**
 * CMake Configuration Generator
 * 
 * Generates CMakeLists.txt for building Google Test test files
 */

import * as path from 'path';

export class CMakeGenerator {
    /**
     * Generate a CMakeLists.txt file for a test executable
     * 
     * @param testFileName - Name of the test .cpp file (e.g., "math_test.cpp")
     * @param sourceFileName - Name of the source .c file (e.g., "math.c") or a
     *   generated wrapper .c file for header-only sources (e.g., "math_wrapper.c")
     * @returns CMakeLists.txt content
     */
        static generate(testFileName: string, sourceFileName: string, conflictGuards: string[] = [], forceIncludes: string[] = [], hasMainFunction: boolean = false): string {
        const projectName = this.getProjectName(sourceFileName);
        const executableName = this.getExecutableName(testFileName);

        // When the source file both #includes a header that defines a struct typedef
        // AND also defines the same struct inline, the C compiler reports
        // "conflicting types".  The fix has two parts:
        //
        //  1. COMPILE_DEFINITIONS: pre-define the header's include guard (-DGUARD_NAME)
        //     so the header body is skipped, leaving only the inline definition.
        //
        //  2. COMPILE_FLAGS -include: one or more headers are force-included before
        //     the source file is compiled.  This covers two sub-cases:
        //       a. A generated supplement header restores types from a skipped header
        //          that the source uses but does not redefine inline (e.g. Point).
        //       b. Standard C headers used by the source (e.g. <limits.h> for INT_MIN)
        //          that the source file omitted are injected so the build does not fail.
        // Merge all compile definitions: header conflict guards + main rename
        const allGuards = [...conflictGuards];
        if (hasMainFunction) {
            allGuards.push('main=__original_main');
        }
        const guardDefsLine = allGuards.length > 0
            ? `\n            COMPILE_DEFINITIONS "${allGuards.join(';')}"` : '';
        const compileFlagsLine = forceIncludes.length > 0
            ? `\n            COMPILE_FLAGS "${forceIncludes.map(h => `-include ${h}`).join(' ')}"` : '';
        return `cmake_minimum_required(VERSION 3.14)
        project(${projectName})

        # Set C++ standard
        set(CMAKE_CXX_STANDARD 14)
        set(CMAKE_CXX_STANDARD_REQUIRED ON)

        # Disable compiler extensions for portability
        set(CMAKE_CXX_EXTENSIONS OFF)

        # Set C standard
        set(CMAKE_C_STANDARD 11)
        set(CMAKE_C_STANDARD_REQUIRED ON)

        # Find Google Test
        find_package(GTest REQUIRED)

        # Include directories
        include_directories(\${GTEST_INCLUDE_DIRS})

        # Compile the C source file with the C compiler (not C++) and, when the
        # source defines a struct typedef that also appears in one of its included
        # headers, pre-define that header's include guard so the header body is
        # skipped — preventing a "conflicting types" error caused by the duplicate
        # typedef declaration.  COMPILE_FLAGS force-includes any headers needed to
        # restore types that would otherwise be missing: a generated supplement
        # header for types skipped along with the header guard, and any standard C
        # headers (e.g. <limits.h>) used by the source file but not explicitly
        # included in it.
        set_source_files_properties(${sourceFileName} PROPERTIES
            LANGUAGE C${guardDefsLine}${compileFlagsLine})
        # Add test executable: C++ test driver + C source file under test
        add_executable(${executableName}
            ${testFileName}
            ${sourceFileName}
        )

        # Link Google Test
        # Try modern CMake targets first, fall back to variables
        if(TARGET GTest::GTest AND TARGET GTest::Main)
            target_link_libraries(${executableName} 
                GTest::GTest 
                GTest::Main
                pthread
            )
        else()
            target_link_libraries(${executableName} 
                \${GTEST_LIBRARIES}
                \${GTEST_MAIN_LIBRARIES}
                pthread
            )
        endif()

        # Enable testing
        enable_testing()

        # Add test
        add_test(NAME ${executableName} COMMAND ${executableName})

        # Print success message
        message(STATUS "Test executable: ${executableName}")
        message(STATUS "Test file: ${testFileName}")
        `;
    }

    /**
     * Extract project name from source file name
     * Example: "math.c" -> "MathTests"
     */
    private static getProjectName(sourceFileName: string): string {
        const baseName = path.basename(sourceFileName, path.extname(sourceFileName));
        // Capitalize first letter
        const capitalized = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        return `${capitalized}Tests`;
    }

    /**
     * Extract executable name from test file name
     * Example: "math_test.cpp" -> "math_tests"
     */
    private static getExecutableName(testFileName: string): string {
        const baseName = path.basename(testFileName, path.extname(testFileName));
        return baseName.replace('_test', '_tests');
    }

    /**
     * Generate build instructions as a comment block
     */
    static generateBuildInstructions(testFileName: string): string {
        const executableName = this.getExecutableName(testFileName);
        
        return `# ============================================================================
# Build Instructions
# ============================================================================
#
# To build and run the tests:
#
#   mkdir build
#   cd build
#   cmake ..
#   cmake --build .
#   ./${executableName}
#
# Or use VS Code tasks:
#   - Press Ctrl+Shift+B (Cmd+Shift+B on Mac) to build
#   - Press Ctrl+Shift+P -> "Tasks: Run Test Task" to run tests
#
# ============================================================================
`;
    }

    /**
     * Generate complete CMakeLists.txt with instructions
     */
    static generateWithInstructions(testFileName: string, sourceFileName: string, conflictGuards: string[] = [], forceIncludes: string[] = [], hasMainFunction: boolean = false): string {
        const instructions = this.generateBuildInstructions(testFileName);
        const cmake = this.generate(testFileName, sourceFileName, conflictGuards, forceIncludes, hasMainFunction);
        
        return instructions + '\n' + cmake;
    }
}