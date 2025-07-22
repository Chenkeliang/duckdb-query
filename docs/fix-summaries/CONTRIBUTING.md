# Contributing to Interactive Data Query

Thank you for your interest in contributing to Interactive Data Query! This document provides guidelines and information for contributors.

## 🚀 Quick Start for Contributors

### Prerequisites
- Node.js 18+ 
- Python 3.9+
- Docker (optional but recommended)

### Development Setup

1. **Fork and Clone**
```bash
git clone https://github.com/your-username/interactive-data-query.git
cd interactive-data-query
```

2. **Quick Start with Docker** (Recommended)
```bash
./start-simple.sh
```

3. **Or Start Locally**
```bash
./start-local.sh
```

## 📋 How to Contribute

### 1. Reporting Issues
- Use the GitHub issue tracker
- Include detailed reproduction steps
- Provide environment information (OS, browser, versions)
- Include screenshots for UI issues

### 2. Feature Requests
- Open an issue with the "enhancement" label
- Describe the use case and expected behavior
- Discuss the implementation approach

### 3. Code Contributions

#### Pull Request Process
1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test your changes thoroughly
4. Update documentation if needed
5. Submit a pull request

#### Code Style Guidelines
- **Python**: Follow PEP 8, use type hints
- **JavaScript/React**: Use ESLint configuration, prefer functional components
- **Commit Messages**: Use conventional commits format

#### Testing
- Add tests for new features
- Ensure existing tests pass
- Test both frontend and backend changes

## 🏗️ Project Structure

```
interactive-data-query/
├── api/                    # FastAPI backend
│   ├── core/              # Core business logic
│   ├── models/            # Data models
│   ├── routers/           # API endpoints
│   └── requirements.txt   # Python dependencies
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   └── services/      # API clients
│   └── package.json       # Node.js dependencies
├── docs/                  # Documentation
└── docker-compose.yml     # Docker configuration
```

## 🔧 Development Guidelines

### Backend Development
- Use FastAPI best practices
- Implement proper error handling
- Add API documentation with docstrings
- Use DuckDB for data processing
- Follow RESTful API design

### Frontend Development
- Use Material-UI components
- Implement responsive design
- Add proper error boundaries
- Use React hooks and functional components
- Optimize for performance

### Database Integration
- Support multiple data sources (CSV, Excel, MySQL, PostgreSQL)
- Use DuckDB for in-memory analytics
- Implement proper connection management
- Handle large datasets efficiently

## 🧪 Testing

### Running Tests
```bash
# Backend tests
cd api
python -m pytest

# Frontend tests
cd frontend
npm test

# Integration tests
./test_enhanced_features.py
```

### Test Coverage
- Aim for >80% test coverage
- Include unit tests and integration tests
- Test error scenarios and edge cases

## 📚 Documentation

### Code Documentation
- Add docstrings to all functions and classes
- Include type hints in Python code
- Comment complex business logic
- Update API documentation

### User Documentation
- Update README.md for new features
- Add examples and use cases
- Include screenshots for UI changes
- Update deployment guides

## 🐛 Debugging

### Common Issues
1. **Port conflicts**: Use `./start-simple.sh` to auto-resolve
2. **Docker issues**: Check Docker daemon and try `./fix-docker-registry.sh`
3. **Dependency issues**: Clear node_modules and reinstall

### Debug Tools
- Backend: Use FastAPI's automatic docs at `/docs`
- Frontend: Use React Developer Tools
- Database: Use DuckDB CLI for query debugging

## 🚀 Release Process

### Version Numbering
- Follow Semantic Versioning (SemVer)
- Major.Minor.Patch format
- Update version in package.json and requirements.txt

### Release Checklist
- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version numbers bumped
- [ ] Docker images built and tested
- [ ] Deployment tested

## 🤝 Community Guidelines

### Code of Conduct
- Be respectful and inclusive
- Help others learn and grow
- Focus on constructive feedback
- Celebrate diverse perspectives

### Communication
- Use GitHub issues for bug reports and feature requests
- Join discussions in pull requests
- Be patient with review process
- Ask questions if anything is unclear

## 📞 Getting Help

- **Documentation**: Check README.md and docs/
- **Issues**: Search existing GitHub issues
- **Questions**: Open a GitHub discussion
- **Bugs**: Create a detailed issue report

## 🎯 Areas for Contribution

### High Priority
- [ ] Add more database connectors (Oracle, SQL Server)
- [ ] Implement data visualization features
- [ ] Add user authentication and authorization
- [ ] Improve mobile responsiveness

### Medium Priority
- [ ] Add data export formats (Parquet, Avro)
- [ ] Implement query caching
- [ ] Add data profiling features
- [ ] Improve error messages

### Good First Issues
- [ ] Fix UI styling issues
- [ ] Add more test cases
- [ ] Improve documentation
- [ ] Add configuration options

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Interactive Data Query! 🎉
