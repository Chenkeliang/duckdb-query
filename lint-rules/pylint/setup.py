"""
DuckQuery Pylint 插件安装配置
"""

from setuptools import setup, find_packages

setup(
    name='duckquery-pylint',
    version='1.0.0',
    description='DuckQuery 项目自定义 Pylint 检查器',
    author='DuckQuery Team',
    packages=find_packages(),
    install_requires=[
        'pylint>=2.0.0',
    ],
    entry_points={
        'pylint.plugins': [
            'duckquery = duckquery_pylint',
        ],
    },
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.11',
    ],
)
