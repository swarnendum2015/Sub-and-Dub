#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    log(`Running: ${command} ${args.join(' ')}`, 'cyan');
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function checkDependencies() {
  log('Checking dependencies...', 'yellow');
  
  const requiredDirs = ['tests', 'node_modules'];
  const missingDirs = requiredDirs.filter(dir => !existsSync(dir));
  
  if (missingDirs.length > 0) {
    log(`Missing directories: ${missingDirs.join(', ')}`, 'red');
    log('Run npm install first', 'yellow');
    process.exit(1);
  }
  
  log('Dependencies check passed', 'green');
}

async function runBackendTests() {
  log('\n=== Running Backend Tests ===', 'bright');
  try {
    await runCommand('npx', ['vitest', 'run', 'tests/backend/']);
    log('Backend tests passed', 'green');
    return true;
  } catch (error) {
    log('Backend tests failed', 'red');
    return false;
  }
}

async function runFrontendTests() {
  log('\n=== Running Frontend Tests ===', 'bright');
  try {
    await runCommand('npx', ['vitest', 'run', 'tests/frontend/']);
    log('Frontend tests passed', 'green');
    return true;
  } catch (error) {
    log('Frontend tests failed', 'red');
    return false;
  }
}

async function runIntegrationTests() {
  log('\n=== Running Integration Tests ===', 'bright');
  try {
    await runCommand('npx', ['vitest', 'run', 'tests/integration/']);
    log('Integration tests passed', 'green');
    return true;
  } catch (error) {
    log('Integration tests failed', 'red');
    return false;
  }
}

async function runE2ETests() {
  log('\n=== Running E2E Tests ===', 'bright');
  try {
    // Check if Playwright is installed
    await runCommand('npx', ['playwright', 'install', '--with-deps']);
    await runCommand('npx', ['playwright', 'test']);
    log('E2E tests passed', 'green');
    return true;
  } catch (error) {
    log('E2E tests failed', 'red');
    return false;
  }
}

async function generateCoverage() {
  log('\n=== Generating Coverage Report ===', 'bright');
  try {
    await runCommand('npx', ['vitest', 'run', '--coverage']);
    log('Coverage report generated', 'green');
    return true;
  } catch (error) {
    log('Coverage generation failed', 'red');
    return false;
  }
}

async function runQualityChecks() {
  log('\n=== Running Quality Checks ===', 'bright');
  try {
    // Type checking
    await runCommand('npx', ['tsc', '--noEmit']);
    log('Type checking passed', 'green');
    
    // Build check
    await runCommand('npm', ['run', 'build']);
    log('Build check passed', 'green');
    
    return true;
  } catch (error) {
    log('Quality checks failed', 'red');
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'all';
  
  log('🧪 Video Dubbing & Translation Platform Test Runner', 'bright');
  log('==================================================', 'bright');
  
  await checkDependencies();
  
  const results = {
    backend: false,
    frontend: false,
    integration: false,
    e2e: false,
    coverage: false,
    quality: false
  };
  
  try {
    switch (testType) {
      case 'backend':
        results.backend = await runBackendTests();
        break;
        
      case 'frontend':
        results.frontend = await runFrontendTests();
        break;
        
      case 'integration':
        results.integration = await runIntegrationTests();
        break;
        
      case 'e2e':
        results.e2e = await runE2ETests();
        break;
        
      case 'coverage':
        results.coverage = await generateCoverage();
        break;
        
      case 'quality':
        results.quality = await runQualityChecks();
        break;
        
      case 'unit':
        results.backend = await runBackendTests();
        results.frontend = await runFrontendTests();
        break;
        
      case 'all':
      default:
        results.backend = await runBackendTests();
        results.frontend = await runFrontendTests();
        results.integration = await runIntegrationTests();
        results.e2e = await runE2ETests();
        results.quality = await runQualityChecks();
        results.coverage = await generateCoverage();
        break;
    }
    
    // Summary
    log('\n' + '='.repeat(50), 'bright');
    log('Test Results Summary', 'bright');
    log('='.repeat(50), 'bright');
    
    Object.entries(results).forEach(([test, passed]) => {
      if (results[test] !== false) {
        const status = passed ? 'PASSED' : 'FAILED';
        const color = passed ? 'green' : 'red';
        log(`${test.padEnd(15)}: ${status}`, color);
      }
    });
    
    const totalTests = Object.values(results).filter(r => r !== false).length;
    const passedTests = Object.values(results).filter(r => r === true).length;
    
    log(`\nTotal: ${passedTests}/${totalTests} test suites passed`, 
         passedTests === totalTests ? 'green' : 'red');
    
    if (passedTests < totalTests) {
      log('\n❌ Some tests failed. Check the output above for details.', 'red');
      process.exit(1);
    } else {
      log('\n✅ All tests passed! The application is production-ready.', 'green');
      process.exit(0);
    }
    
  } catch (error) {
    log(`\nUnexpected error: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  log('Video Dubbing & Translation Platform Test Runner', 'bright');
  log('Usage: node test-runner.js [test-type]', 'cyan');
  log('\nTest types:', 'yellow');
  log('  all         - Run all tests (default)', 'cyan');
  log('  backend     - Run backend API tests only', 'cyan');
  log('  frontend    - Run frontend component tests only', 'cyan');
  log('  integration - Run integration tests only', 'cyan');
  log('  e2e         - Run end-to-end tests only', 'cyan');
  log('  unit        - Run backend and frontend tests', 'cyan');
  log('  coverage    - Generate coverage report', 'cyan');
  log('  quality     - Run quality checks (type check, build)', 'cyan');
  log('\nExamples:', 'yellow');
  log('  node test-runner.js', 'cyan');
  log('  node test-runner.js backend', 'cyan');
  log('  node test-runner.js e2e', 'cyan');
  process.exit(0);
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});