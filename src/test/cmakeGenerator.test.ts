import * as assert from 'assert';
import { CMakeGenerator } from '../generator/cmakeGenerator';
suite('CMakeGenerator — generate()', () => {
    test('output contains cmake_minimum_required', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('cmake_minimum_required'), 'should include cmake_minimum_required');
    });
    test('output contains project name derived from source file', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('MathTests'), 'project name should be MathTests for math.c');
    });
    test('project name capitalizes first letter', () => {
        const content = CMakeGenerator.generate('test_calc.cpp', 'calc.c');
        assert.ok(content.includes('CalcTests'), 'project name should be CalcTests for calc.c');
    });
    test('output contains find_package GTest', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('find_package(GTest REQUIRED)'), 'should link Google Test');
    });
    test('output contains target_link_libraries with GTest', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('GTest::GTest') || content.includes('GTEST_LIBRARIES'), 'should link GTest libraries');
    });
    test('output contains C++ standard 14', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('CMAKE_CXX_STANDARD 14'), 'should set C++14 standard');
    });
    test('output contains C standard 11', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('CMAKE_C_STANDARD 11'), 'should set C11 standard');
    });
    test('executable name derived from test file name', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        // 'test_math.cpp' -> 'test_maths' (replaces _test with _tests)
        assert.ok(content.includes('test_maths'), 'executable name should be test_maths');
    });
    test('add_executable includes both test and source files', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('test_math.cpp'), 'should include test file in add_executable');
        assert.ok(content.includes('math.c'), 'should include source file in add_executable');
    });
    test('conflictGuards are included in COMPILE_DEFINITIONS', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c', ['MATH_H_INCLUDED']);
        assert.ok(content.includes('COMPILE_DEFINITIONS'), 'should include COMPILE_DEFINITIONS');
        assert.ok(content.includes('MATH_H_INCLUDED'), 'should include the guard');
    });
    test('forceIncludes are added as -include flags', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c', [], ['supplement.h']);
        assert.ok(content.includes('-include supplement.h'), 'should add -include flag');
    });
    test('hasMainFunction=true adds main rename guard', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c', [], [], true);
        assert.ok(content.includes('main=__original_main'), 'should add main rename guard');
    });
    test('no conflictGuards produces no COMPILE_DEFINITIONS line', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.strictEqual(content.includes('COMPILE_DEFINITIONS'), false, 'no guards → no COMPILE_DEFINITIONS');
    });
    test('output contains add_test', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('add_test'), 'should contain add_test directive');
    });
    test('output contains enable_testing', () => {
        const content = CMakeGenerator.generate('test_math.cpp', 'math.c');
        assert.ok(content.includes('enable_testing()'), 'should enable testing');
    });
});
suite('CMakeGenerator — getProjectName / getExecutableName (via generate)', () => {
    test('source file with path strips directory', () => {
        const content = CMakeGenerator.generate('test_utils.cpp', '/some/path/utils.c');
        assert.ok(content.includes('UtilsTests'), 'should strip directory and capitalize');
    });
    test('test file with _test suffix → executable with _tests suffix', () => {
        const content = CMakeGenerator.generate('calc_test.cpp', 'calc.c');
        assert.ok(content.includes('calc_tests'), 'executable name should have _tests suffix');
    });
});
suite('CMakeGenerator — generateBuildInstructions', () => {
    test('contains build steps (mkdir, cmake, cmake --build)', () => {
        const content = CMakeGenerator.generateBuildInstructions('test_math.cpp');
        assert.ok(content.includes('mkdir'), 'should contain mkdir');
        assert.ok(content.includes('cmake'), 'should contain cmake');
        assert.ok(content.includes('cmake --build'), 'should contain cmake --build');
    });
    test('contains the executable name', () => {
        const content = CMakeGenerator.generateBuildInstructions('test_math.cpp');
        assert.ok(content.includes('test_maths'), 'should contain the executable name');
    });
    test('output is a comment block (lines start with #)', () => {
        const lines = CMakeGenerator.generateBuildInstructions('test_math.cpp')
            .split('\n')
            .filter(l => l.trim() !== '');
        const allComments = lines.every(l => l.startsWith('#'));
        assert.ok(allComments, 'build instructions should be comment lines');
    });
});
suite('CMakeGenerator — generateWithInstructions', () => {
    test('combines build instructions and cmake content', () => {
        const content = CMakeGenerator.generateWithInstructions('test_math.cpp', 'math.c');
        assert.ok(content.includes('mkdir'), 'should have build instructions');
        assert.ok(content.includes('cmake_minimum_required'), 'should have cmake content');
    });
});