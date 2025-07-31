import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Space,
  Typography,
  Tag
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BookOutlined,
  CodeOutlined,
  SearchOutlined
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { playbooksAPI } from '../services/api';
import moment from 'moment';

const { Title } = Typography;
const { TextArea } = Input;

const Playbooks = () => {
  const [playbooks, setPlaybooks] = useState([]);
  const [filteredPlaybooks, setFilteredPlaybooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [form] = Form.useForm();

  // VS Code-like editor options
  const editorOptions = {
    selectOnLineNumbers: true,
    automaticLayout: true,
    minimap: { enabled: true, side: 'right' },
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    wordWrap: 'on',
    folding: true,
    foldingHighlight: true,
    showFoldingControls: 'always',
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    suggest: {
      enabled: true,
      showKeywords: true,
      showSnippets: true,
    },
    quickSuggestions: {
      other: true,
      comments: true,
      strings: true,
    },
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'on',
    accessibilitySupport: 'auto',
    autoIndent: 'full',
    contextmenu: true,
    copyWithSyntaxHighlighting: true,
    cursorBlinking: 'blink',
    cursorSmoothCaretAnimation: true,
    cursorWidth: 2,
    dragAndDrop: true,
    emptySelectionClipboard: true,
    find: {
      cursorMoveOnType: true,
      seedSearchStringFromSelection: true,
      autoFindInSelection: 'never',
    },
    hover: { enabled: true, delay: 300 },
    lightbulb: { enabled: true },
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,
    links: true,
    matchBrackets: 'always',
    mouseWheelScrollSensitivity: 1,
    mouseWheelZoom: true,
    multiCursorMergeOverlapping: true,
    multiCursorModifier: 'alt',
    overviewRulerBorder: true,
    overviewRulerLanes: 2,
    padding: { top: 10, bottom: 10 },
    parameterHints: { enabled: true, cycle: false },
    renderControlCharacters: false,
    renderFinalNewline: true,
    renderLineHighlight: 'line',
    renderValidationDecorations: 'editable',
    renderWhitespace: 'selection',
    scrollbar: {
      useShadows: false,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      vertical: 'visible',
      horizontal: 'visible',
      verticalScrollbarSize: 14,
      horizontalScrollbarSize: 12,
    },
    smoothScrolling: true,
    snippetSuggestions: 'top',
    tabCompletion: 'on',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    useTabStops: true,
    wrappingIndent: 'none',
    wrappingStrategy: 'simple',
  };

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  const fetchPlaybooks = async () => {
    setLoading(true);
    try {
      const response = await playbooksAPI.getAll();
      setPlaybooks(response.data);
      setFilteredPlaybooks(response.data);
    } catch (error) {
      message.error('Failed to fetch playbooks');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    if (!value) {
      setFilteredPlaybooks(playbooks);
    } else {
      const filtered = playbooks.filter(playbook =>
        playbook.name.toLowerCase().includes(value.toLowerCase()) ||
        (playbook.description && playbook.description.toLowerCase().includes(value.toLowerCase()))
      );
      setFilteredPlaybooks(filtered);
    }
  };

  const handleCreate = () => {
    setEditingPlaybook(null);
    form.resetFields();
    const defaultContent = `---
- name: Sample playbook
  hosts: all
  become: yes
  tasks:
    - name: Update system packages
      apt:
        update_cache: yes
      when: ansible_os_family == "Debian"
    
    - name: Install essential packages
      package:
        name:
          - curl
          - wget
          - vim
        state: present`;
    
    setEditorContent(defaultContent);
    form.setFieldsValue({
      content: defaultContent
    });
    setModalVisible(true);
  };

  const handleEdit = (playbook) => {
    setEditingPlaybook(playbook);
    setEditorContent(playbook.content || '');
    form.setFieldsValue(playbook);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await playbooksAPI.delete(id);
      message.success('Playbook deleted successfully');
      fetchPlaybooks();
    } catch (error) {
      message.error('Failed to delete playbook');
    }
  };

  const handleEditorChange = (value) => {
    setEditorContent(value || '');
    form.setFieldsValue({ content: value || '' });
  };

  const handleSubmit = async (values) => {
    try {
      // Make sure we use the editor content
      const submitValues = {
        ...values,
        content: editorContent
      };
      
      if (editingPlaybook) {
        await playbooksAPI.update(editingPlaybook.id, submitValues);
        message.success('Playbook updated successfully');
      } else {
        await playbooksAPI.create(submitValues);
        message.success('Playbook created successfully');
      }
      setModalVisible(false);
      fetchPlaybooks();
    } catch (error) {
      message.error(`Failed to ${editingPlaybook ? 'update' : 'create'} playbook`);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <BookOutlined style={{ color: '#1890ff' }} />
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => moment(date).format('MMM DD, YYYY HH:mm'),
      width: 180,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date) => moment(date).format('MMM DD, YYYY HH:mm'),
      width: 180,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title="Edit"
          />
          <Popconfirm
            title="Are you sure you want to delete this playbook?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Delete"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <BookOutlined />
            <Title level={4} style={{ margin: 0 }}>Ansible Playbooks</Title>
          </Space>
        }
        extra={
          <Space>
            <Input.Search
              placeholder="Search playbooks..."
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 250 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              New Playbook
            </Button>
          </Space>
        }
        className="card-container"
      >
        <Table
          columns={columns}
          dataSource={filteredPlaybooks}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} playbooks`,
          }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <CodeOutlined />
            {editingPlaybook ? 'Edit Playbook' : 'Create New Playbook'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1000}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="Playbook Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter playbook name' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: 'Name can only contain letters, numbers, underscores, and hyphens' }
            ]}
          >
            <Input placeholder="e.g., nginx-setup" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of what this playbook does" />
          </Form.Item>



          <Form.Item
            label="Playbook Content (YAML)"
            name="content"
            rules={[{ required: true, message: 'Please enter playbook content' }]}
          >
            <div 
              style={{ 
                height: '500px', 
                border: '1px solid #3c3c3c',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                background: '#1e1e1e'
              }}
            >
              <div 
                style={{
                  height: '32px',
                  background: 'linear-gradient(to bottom, #3c3c3c, #2d2d30)',
                  borderBottom: '1px solid #2d2d30',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '12px',
                  fontSize: '12px',
                  color: '#cccccc',
                  fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
                }}
              >
                <span style={{ marginRight: '8px' }}>📄</span>
                <span>{editingPlaybook ? `${editingPlaybook.name}.yml` : 'new-playbook.yml'}</span>
                <div style={{ marginLeft: 'auto', marginRight: '12px', display: 'flex', gap: '4px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' }}></div>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28ca42' }}></div>
                </div>
              </div>
              <Editor
                height="calc(100% - 32px)"
                language="yaml"
                value={editorContent}
                onChange={handleEditorChange}
                options={editorOptions}
                theme="vs-dark"
                beforeMount={(monaco) => {
                  // Register YAML snippets for Ansible
                  monaco.languages.registerCompletionItemProvider('yaml', {
                    provideCompletionItems: (model, position) => {
                      const suggestions = [
                        {
                          label: 'playbook',
                          kind: monaco.languages.CompletionItemKind.Snippet,
                          insertText: [
                            '---',
                            '- name: ${1:Playbook Description}',
                            '  hosts: ${2:all}',
                            '  become: ${3:yes}',
                            '  tasks:',
                            '    - name: ${4:Task Description}',
                            '      ${5:module_name}:',
                            '        ${6:parameter}: ${7:value}'
                          ].join('\n'),
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Basic Ansible playbook structure'
                        },
                        {
                          label: 'task',
                          kind: monaco.languages.CompletionItemKind.Snippet,
                          insertText: [
                            '- name: ${1:Task Description}',
                            '  ${2:module_name}:',
                            '    ${3:parameter}: ${4:value}'
                          ].join('\n'),
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Ansible task template'
                        },
                        {
                          label: 'shell',
                          kind: monaco.languages.CompletionItemKind.Snippet,
                          insertText: [
                            '- name: ${1:Execute shell command}',
                            '  shell: ${2:command}',
                            '  register: ${3:result}'
                          ].join('\n'),
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Shell module task'
                        },
                        {
                          label: 'copy',
                          kind: monaco.languages.CompletionItemKind.Snippet,
                          insertText: [
                            '- name: ${1:Copy file}',
                            '  copy:',
                            '    src: ${2:source_file}',
                            '    dest: ${3:destination_path}',
                            '    mode: ${4:0644}'
                          ].join('\n'),
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Copy module task'
                        },
                        {
                          label: 'service',
                          kind: monaco.languages.CompletionItemKind.Snippet,
                          insertText: [
                            '- name: ${1:Manage service}',
                            '  service:',
                            '    name: ${2:service_name}',
                            '    state: ${3:started}',
                            '    enabled: ${4:yes}'
                          ].join('\n'),
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Service module task'
                        }
                      ];
                      return { suggestions };
                    }
                  });
                }}
              />
            </div>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingPlaybook ? 'Update' : 'Create'} Playbook
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Playbooks; 