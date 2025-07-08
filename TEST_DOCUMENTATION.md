# Comprehensive Testing Framework

## Overview

This testing framework provides comprehensive test coverage for the Video Dubbing & Translation Platform, ensuring production-grade quality and preventing regressions.

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── fixtures/
│   └── sample-data.ts          # Mock data and test fixtures
├── backend/
│   ├── api.test.ts            # Backend API endpoint tests
│   └── test-app.ts            # Test application setup
├── frontend/
│   ├── components/            # Component unit tests
│   └── pages/                 # Page integration tests
├── e2e/
│   ├── upload-workflow.spec.ts     # Upload workflow tests
│   ├── transcription-workflow.spec.ts # Transcription tests
│   ├── translation-workflow.spec.ts   # Translation tests
│   ├── dubbing-workflow.spec.ts       # Dubbing tests
│   └── srt-export.spec.ts            # SRT export tests
├── integration/
│   └── end-to-end.test.ts     # Full system integration tests
└── utils/
    └── test-helpers.ts        # Testing utilities
```

## Test Types

### 1. Backend API Tests (`tests/backend/`)

Tests all REST API endpoints with:
- Video upload and processing
- Multi-model transcription
- Batch translation
- Dubbing job creation
- Error handling and validation
- Performance benchmarks

**Run:** `npx vitest run tests/backend/`

### 2. Frontend Component Tests (`tests/frontend/`)

Tests React components with:
- Transcription panel functionality
- Translation interface
- Model selection dropdowns
- File upload components
- User interactions and state management

**Run:** `npx vitest run tests/frontend/`

### 3. End-to-End Tests (`tests/e2e/`)

Tests complete user workflows with Playwright:
- **Upload Workflow**: File/S3/YouTube upload, validation, processing
- **Transcription Workflow**: Multi-model processing, editing, confirmation
- **Translation Workflow**: Batch translation, model selection, editing
- **Dubbing Workflow**: Speaker selection, voice assignment, job tracking
- **SRT Export**: Multi-language subtitle generation

**Run:** `npx playwright test`

### 4. Integration Tests (`tests/integration/`)

Tests complete system integration:
- Full pipeline: upload → transcribe → translate → dub → export
- Multi-model processing with fallbacks
- Concurrent video processing
- Error recovery and retries
- Data consistency validation
- Performance benchmarks

**Run:** `npx vitest run tests/integration/`

## Quick Start

### Install Dependencies
```bash
npm install
npx playwright install
```

### Run All Tests
```bash
node test-runner.js
```

### Run Specific Test Types
```bash
# Backend tests only
node test-runner.js backend

# Frontend tests only  
node test-runner.js frontend

# E2E tests only
node test-runner.js e2e

# Integration tests only
node test-runner.js integration

# Coverage report
node test-runner.js coverage
```

## Test Data

The framework uses comprehensive mock data in `tests/fixtures/sample-data.ts`:

- **Videos**: Test video metadata with various statuses
- **Transcriptions**: Multi-speaker Bengali transcriptions with confidence scores
- **Translations**: Multi-language translations with accuracy metrics
- **Dubbing Jobs**: ElevenLabs dubbing jobs with different states
- **File Fixtures**: Mock video files for upload testing

## Coverage Requirements

Target coverage thresholds:
- **Statements**: 85%
- **Branches**: 80%
- **Functions**: 85%
- **Lines**: 85%

Generate coverage report:
```bash
npx vitest run --coverage
```

## Continuous Integration

The framework includes GitHub Actions workflows (`.github/workflows/ci.yml`):

1. **Backend Tests**: API and integration tests with PostgreSQL
2. **Frontend Tests**: Component tests and build verification
3. **E2E Tests**: Full browser automation tests
4. **Coverage**: Code coverage reporting
5. **Quality Checks**: TypeScript, linting, security audit

## Performance Testing

Integration tests include performance benchmarks:
- Transcription processing time: < 30 seconds
- Batch translation time: < 15 seconds
- API response times: < 2 seconds
- File upload handling: Up to 500MB

## Error Testing

Comprehensive error scenario testing:
- API quota exceeded handling
- Network failures and retries
- Invalid file formats and sizes
- Authentication failures
- Database connection issues

## Test Utilities

`tests/utils/test-helpers.ts` provides:
- Mock API response generators
- File upload simulation
- Performance measurement tools
- SRT format validation
- Test data factories

## Browser Testing

E2E tests run on multiple browsers:
- Chrome (Chromium)
- Firefox
- Safari (WebKit)

## Running Tests in Development

### Watch Mode
```bash
npx vitest
```

### Interactive UI
```bash
npx vitest --ui
```

### Playwright UI Mode
```bash
npx playwright test --ui
```

## Debugging Tests

### Frontend Tests
```bash
# Debug specific component
npx vitest run tests/frontend/components/EditableTranscriptionPanel.test.tsx --reporter=verbose

# Debug with browser tools
npx vitest --ui
```

### E2E Tests
```bash
# Run with visible browser
npx playwright test --headed

# Debug mode
npx playwright test --debug

# Trace viewer
npx playwright show-trace trace.zip
```

## Production Readiness Checks

The test suite validates production readiness:

✅ **Functionality**: All features work correctly  
✅ **Performance**: Meets speed requirements  
✅ **Reliability**: Error handling and recovery  
✅ **Security**: Input validation and sanitization  
✅ **Scalability**: Concurrent processing support  
✅ **Compatibility**: Cross-browser support  
✅ **Data Integrity**: Accurate transcription/translation  
✅ **User Experience**: Intuitive workflows  

## Test Best Practices

1. **Isolation**: Each test is independent
2. **Reliability**: Tests are deterministic and stable
3. **Speed**: Fast feedback loop for development
4. **Maintainability**: Clear structure and documentation
5. **Real Data**: Uses authentic API responses when possible
6. **Edge Cases**: Covers error conditions and boundary cases

## Troubleshooting

### Common Issues

**Tests fail with "fetch is not defined"**
- Ensure `tests/setup.ts` is configured properly
- Check vitest.config.ts setupFiles

**E2E tests timeout**
- Increase timeout in playwright.config.ts
- Check if application server is running
- Verify network connectivity

**Coverage reports missing**
- Install coverage dependencies: `npm install -D @vitest/coverage-c8`
- Run with coverage flag: `npx vitest run --coverage`

### Getting Help

1. Check test output for specific error messages
2. Review logs in the console during test runs
3. Use debug mode for step-by-step execution
4. Verify all dependencies are installed correctly

## Continuous Improvement

The testing framework supports:
- Automatic test discovery
- Parallel execution for speed
- Custom reporters for detailed output
- Integration with CI/CD pipelines
- Performance regression detection
- Security vulnerability scanning

This comprehensive testing ensures the Video Dubbing & Translation Platform maintains production-grade quality with every change.