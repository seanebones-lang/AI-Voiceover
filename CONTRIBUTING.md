# Contributing to AI-Voiceover

Thank you for your interest in contributing to AI-Voiceover! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites

- Node.js 22+ installed
- npm or yarn package manager
- Git installed
- Basic knowledge of TypeScript, React, and Next.js

### Development Setup

1. **Fork the repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/your-username/AI-Voiceover.git
   cd AI-Voiceover
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## 📝 Code Style

### TypeScript

- Use **strict mode** TypeScript
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` if type is truly unknown

```typescript
// ✅ Good
interface UserProps {
  name: string
  age: number
}

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### React Components

- Use functional components with hooks
- Use `React.memo` for presentational components
- Extract custom hooks for reusable logic
- Use TypeScript interfaces for props

```typescript
// ✅ Good
interface ButtonProps {
  label: string
  onClick: () => void
}

export const Button = React.memo(function Button({ 
  label, 
  onClick 
}: ButtonProps) {
  return <button onClick={onClick}>{label}</button>
})

// ❌ Bad
export function Button(props: any) {
  return <button onClick={props.onClick}>{props.label}</button>
}
```

### Naming Conventions

- **Components**: PascalCase (`AudioPlayer.tsx`)
- **Hooks**: camelCase starting with `use` (`useVoices.ts`)
- **Utilities**: camelCase (`validation.ts`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_TEXT_LENGTH`)
- **Files**: Match export name (`audio-player.tsx` for `AudioPlayer`)

### File Organization

```
components/
  audio-player.tsx      # Component file
  ui/
    button.tsx          # UI components
lib/
  validation.ts         # Utility functions
hooks/
  useVoices.ts         # Custom hooks
app/
  api/
    tts/
      route.ts         # API routes
```

## 🧪 Testing

### Test Requirements

- Write tests for all new features
- Maintain **80% code coverage**
- Test both success and error cases
- Use React Testing Library for components

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- __tests__/components/audio-player.test.tsx
```

### Test Structure

```typescript
// ✅ Good test structure
describe('AudioPlayer', () => {
  it('renders audio element with src', () => {
    render(<AudioPlayer src="/test.wav" />)
    const audio = document.querySelector('audio')
    expect(audio).toHaveAttribute('src', '/test.wav')
  })

  it('handles missing src gracefully', () => {
    render(<AudioPlayer src="" />)
    // Test behavior
  })
})
```

## 📦 Pull Request Process

### Before Submitting

1. **Update documentation**
   - Update README if needed
   - Add JSDoc comments for new functions
   - Update API documentation if adding endpoints

2. **Run tests**
   ```bash
   npm test
   npm run lint
   ```

3. **Check code coverage**
   ```bash
   npm test -- --coverage
   ```

4. **Test manually**
   - Test the feature in development
   - Verify error handling
   - Check accessibility

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No hardcoded secrets
- [ ] Accessibility considered
- [ ] Performance impact assessed

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Code follows style guide
```

## 🐛 Reporting Bugs

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g., macOS 14.0]
- Browser: [e.g., Chrome 120]
- Node version: [e.g., 22.0.0]

**Additional context**
Any other relevant information.
```

## 💡 Feature Requests

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions you've thought about.

**Additional context**
Any other information about the feature request.
```

## 🔍 Code Review

### Review Guidelines

- Be respectful and constructive
- Focus on code, not the person
- Suggest improvements, don't just point out issues
- Approve when code meets standards

### What Reviewers Look For

- Code quality and style
- Test coverage
- Documentation completeness
- Performance considerations
- Security implications
- Accessibility compliance

## 📚 Documentation

### Adding Documentation

- Update relevant `.md` files
- Add JSDoc comments to functions
- Include examples in documentation
- Update API documentation for new endpoints

### Documentation Style

- Use clear, concise language
- Include code examples
- Add screenshots for UI changes
- Keep documentation up to date

## 🚫 What Not to Do

- ❌ Don't commit secrets or API keys
- ❌ Don't commit large files (>10MB)
- ❌ Don't break existing functionality
- ❌ Don't skip tests
- ❌ Don't ignore linting errors
- ❌ Don't use `console.log` in production code

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and discussions
- **Documentation**: Check existing docs first

## 🎉 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Credited in release notes
- Appreciated by the community!

---

Thank you for contributing! 🚀
