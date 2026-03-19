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
     * @param sourceFileName - Name of the source .c file (e.g., "math.c")
     * @returns CMakeLists.txt content
     */
    static generate(testFileName: string, sourceFileName: string): string {
        const projectName = this.getProjectName(sourceFileName);
        const executableName = this.getExecutableName(testFileName);

        return `cmake_minimum_required(VERSION 3.14)
        project(${projectName})

        # Set C++ standard
        set(CMAKE_CXX_STANDARD 14)
        set(CMAKE_CXX_STANDARD_REQUIRED ON)

        # Disable compiler extensions for portability
        set(CMAKE_CXX_EXTENSIONS OFF)

        # Find Google Test
        find_package(GTest REQUIRED)

        # Include directories
        include_directories(\${GTEST_INCLUDE_DIRS})

        # Compile the C source file with the C compiler (not C++) so that
        # GCC's GNU C mode accepts identical typedef re-declarations that
        # would be a hard error in C++.
        set_source_files_properties(${sourceFileName} PROPERTIES LANGUAGE C)

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
    static generateWithInstructions(testFileName: string, sourceFileName: string): string {
        const instructions = this.generateBuildInstructions(testFileName);
        const cmake = this.generate(testFileName, sourceFileName);
        
        return instructions + '\n' + cmake;
    }
}