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
  Tag,
  Progress,
  Upload,
  List,
  Divider,
  Tooltip,
  Alert,
  Select,
  Radio,
  Row,
  Col,
  theme
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BookOutlined,
  CodeOutlined,
  SearchOutlined,
  UploadOutlined,
  FileOutlined,
  DownloadOutlined,
  InboxOutlined,
  GitlabOutlined,
  GithubOutlined,
  BranchesOutlined
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { playbooksAPI, playbookFilesAPI, credentialsAPI, variablesAPI } from '../services/api';
import { hasPermission } from '../utils/permissions';
import moment from 'moment';

const { Title } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

const Playbooks = ({ currentUser }) => {
  const { token } = theme.useToken();
  const [playbooks, setPlaybooks] = useState([]);
  const [filteredPlaybooks, setFilteredPlaybooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [form] = Form.useForm();
  
  // File management state
  const [playbookFiles, setPlaybookFiles] = useState([]);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [canUploadFiles, setCanUploadFiles] = useState(false);
  const [tempFiles, setTempFiles] = useState([]); // Store files before playbook is saved
  
  // Git import state
  const [creationMethod, setCreationMethod] = useState('manual'); // 'manual' or 'git'
  const [gitImportLoading, setGitImportLoading] = useState(false);
  const [importedContent, setImportedContent] = useState('');
  const [gitVisibility, setGitVisibility] = useState('public'); // 'public' or 'private'
  const [credentials, setCredentials] = useState([]);
  const [globalVariables, setGlobalVariables] = useState([]);
  const [selectedVariables, setSelectedVariables] = useState([]);
  const [gitForm] = Form.useForm();

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
    fetchCredentials();
    fetchGlobalVariables();
  }, []);

  const fetchPlaybooks = async () => {
    setLoading(true);
    try {
      const response = await playbooksAPI.getAll();
      // Sort by newest first (created_at descending)
      const sortedPlaybooks = response.data.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setPlaybooks(sortedPlaybooks);
      setFilteredPlaybooks(sortedPlaybooks);
    } catch (error) {
      message.error('Failed to fetch playbooks');
    } finally {
      setLoading(false);
    }
  };

  const fetchCredentials = async () => {
    try {
      const response = await credentialsAPI.getAll();
      setCredentials(response.data);
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
    }
  };

  const fetchGlobalVariables = async () => {
    try {
      const response = await variablesAPI.getAll();
      setGlobalVariables(response.data);
    } catch (error) {
      console.error('Failed to fetch global variables:', error);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    if (!value) {
      setFilteredPlaybooks(playbooks);
    } else {
      const filtered = playbooks.filter(playbook =>
        (playbook.name && playbook.name.toLowerCase().includes(value.toLowerCase())) ||
        (playbook.description && playbook.description.toLowerCase().includes(value.toLowerCase()))
      );
      // Keep sort order (newest first) after filtering
      const sortedFiltered = filtered.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setFilteredPlaybooks(sortedFiltered);
    }
  };

  const getDefaultContent = (osType = 'linux') => {
    if (osType === 'windows') {
      return `---
- name: Sample Windows playbook
  hosts: all
  gather_facts: yes
  tasks:
    - name: Ensure a service exists and is running
      win_service:
        name: Spooler
        state: started
    
    - name: Install chocolatey packages
      win_chocolatey:
        name:
          - googlechrome
          - notepadplusplus
          - 7zip
        state: present
    
    - name: Create a directory
      win_file:
        path: C:\\temp\\example
        state: directory
    
    - name: Copy a file
      win_copy:
        src: files/example.txt
        dest: C:\\temp\\example\\example.txt`;
    } else {
      return `---
- name: Sample Linux playbook
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
        state: present
    
    - name: Create a directory
      file:
        path: /tmp/example
        state: directory
        mode: '0755'
    
    - name: Copy a file
      copy:
        src: files/example.txt
        dest: /tmp/example/example.txt
        mode: '0644'`;
    }
  };

  const handleCreate = () => {
    setEditingPlaybook(null);
    form.resetFields();
    gitForm.resetFields();
    setCreationMethod('manual');
    setImportedContent('');
    const defaultContent = getDefaultContent('linux'); // Default to Linux
    
    setEditorContent(defaultContent);
    form.setFieldsValue({
      content: defaultContent,
      os_type: 'linux'
    });
    setModalVisible(true);
  };

  const handleOSTypeChange = (osType) => {
    const newContent = getDefaultContent(osType);
    setEditorContent(newContent);
    form.setFieldsValue({
      content: newContent
    });
  };

  const handleEdit = (playbook) => {
    console.log('🔥 EDITING PLAYBOOK:', playbook);
    console.log('🔥 CREATION METHOD:', playbook.creation_method);
    console.log('🔥 GIT REPO URL:', playbook.git_repo_url);
    console.log('🔥 GIT FILE PATH:', playbook.git_file_path);
    console.log('🔥 GIT FILENAME:', playbook.git_filename);
    console.log('🔥 GIT VISIBILITY:', playbook.git_visibility);
    console.log('🔥 GIT CREDENTIAL ID:', playbook.git_credential_id);
    
    setEditingPlaybook(playbook);
    setEditorContent(playbook.content || '');
    
    // Set assigned variables
    setSelectedVariables(playbook.assigned_variables || []);
    
    // Set creation method based on how the playbook was originally created
    const method = playbook.creation_method || 'manual';
    console.log('🔥 SETTING CREATION METHOD TO:', method);
    setCreationMethod(method);
    
    // Set git visibility for git imports (default to public if not set)
    if (method === 'git') {
      const visibility = playbook.git_visibility || 'public';
      console.log('🔥 SETTING GIT VISIBILITY TO:', visibility);
      setGitVisibility(visibility);
    }
    
    // Set form values including creation_method and git metadata
    form.setFieldsValue({
      ...playbook,
      creation_method: method,
      assigned_variables: playbook.assigned_variables || [],
      git_visibility: playbook.git_visibility || 'public',
      git_credential_id: playbook.git_credential_id || ''
    });
    
    // If it was created from Git, populate Git form fields
    if (method === 'git') {
      console.log('🔥 POPULATING GIT FORM WITH:', {
        repo_url: playbook.git_repo_url,
        file_path: playbook.git_file_path,
        filename: playbook.git_filename
      });
      
      gitForm.setFieldsValue({
        repo_url: playbook.git_repo_url || '',
        file_path: playbook.git_file_path || '',
        filename: playbook.git_filename || '',
        git_visibility: playbook.git_visibility || 'public',
        git_credential_id: playbook.git_credential_id || ''
      });
      
      // Force a refresh to make sure values are visible
      setTimeout(() => {
        const visibility = playbook.git_visibility || 'public';
        console.log('🔥 TIMEOUT - SETTING GIT FORM VALUES, VISIBILITY:', visibility);
        console.log('🔥 TIMEOUT - CREDENTIAL ID:', playbook.git_credential_id);
        
        gitForm.setFieldsValue({
          repo_url: playbook.git_repo_url || '',
          file_path: playbook.git_file_path || '',
          filename: playbook.git_filename || '',
          git_visibility: visibility,
          git_credential_id: playbook.git_credential_id || ''
        });
        
        // Also update the state to reflect the visibility
        setGitVisibility(visibility);
        console.log('🔥 TIMEOUT - STATE SET TO:', visibility);
      }, 200);
    }
    
    setModalVisible(true);
    setCanUploadFiles(true); // Enable file uploads for existing playbooks
    
    // Fetch files for existing playbook
    if (playbook.id) {
      fetchPlaybookFiles(playbook.id);
    }
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

  // File management functions
  const fetchPlaybookFiles = async (playbookId) => {
    if (!playbookId) return;
    
    try {
      setFileListLoading(true);
      const response = await playbookFilesAPI.getAll(playbookId);
      setPlaybookFiles(response.data);
    } catch (error) {
      message.error('Failed to fetch playbook files');
    } finally {
      setFileListLoading(false);
    }
  };

  const handleFileUpload = async (options) => {
    const { file, onProgress, onError, onSuccess } = options;
    
    console.log('🔺 Upload initiated:', {
      filename: file.name,
      size: file.size,
      type: file.type,
      playbookId: editingPlaybook?.id,
      hasPlaybook: !!editingPlaybook?.id
    });

    // If playbook doesn't exist yet, store files temporarily
    if (!editingPlaybook?.id) {
      console.log('📦 Adding to temp files (playbook not saved yet)');
      const existingTempIndex = tempFiles.findIndex(tf => tf.filename === file.name);
      const tempFile = {
        id: Date.now() + Math.random(),
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        description: '',
        fileObject: file,
        isTemp: true
      };
      if (existingTempIndex >= 0) {
        setTempFiles(prev => {
          const updated = [...prev];
          updated[existingTempIndex] = tempFile;
          return updated;
        });
        message.warning(`${file.name} replaced in queue (will be uploaded with playbook)`);
      } else {
        setTempFiles(prev => [...prev, tempFile]);
        message.success(`${file.name} ready to upload (will be saved with playbook)`);
      }
      if (onSuccess) onSuccess({}, file);
      return;
    }

    // Upload immediately with progress
    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', '');

    console.log('🚀 Starting upload to existing playbook:', editingPlaybook.id);

    try {
      console.log('🔄 Setting upload states...');
      setUploadLoading(true);
      setUploadingFileName(file.name);
      setUploadProgress(0);
      console.log('✅ Upload states set - loading should now be visible');
      
      const response = await playbookFilesAPI.upload(
        editingPlaybook.id,
        formData,
        {
          timeout: 600000, // 10 minutes timeout for large files
          onUploadProgress: (event) => {
            if (event.total) {
              const percent = Math.round((event.loaded * 100) / event.total);
              const mbLoaded = (event.loaded / 1024 / 1024).toFixed(1);
              const mbTotal = (event.total / 1024 / 1024).toFixed(1);
              console.log(`📊 Upload progress: ${percent}% (${mbLoaded}MB/${mbTotal}MB)`);
              setUploadProgress(percent);
              if (onProgress) onProgress({ percent });
            } else {
              console.log(`📊 Upload progress: ${event.loaded} bytes (total unknown)`);
            }
          }
        }
      );

      console.log('✅ Upload successful:', response.data);
      if (response.data.replaced) {
        message.warning(response.data.message || `${file.name} replaced successfully`);
      } else {
        message.success(response.data.message || `${file.name} uploaded successfully`);
      }
      fetchPlaybookFiles(editingPlaybook.id);
      if (onSuccess) onSuccess(response.data, file);
    } catch (error) {
      console.error('❌ Upload failed:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      let errorMessage = `Failed to upload ${file.name}`;
      if (error.response?.status === 413) {
        errorMessage = `File ${file.name} is too large`;
      } else if (error.response?.status === 504) {
        errorMessage = `Upload timeout for ${file.name} - file may be too large`;
      } else if (error.response?.data?.error) {
        errorMessage = `Upload failed: ${error.response.data.error}`;
      }
      
      message.error(errorMessage);
      if (onError) onError(error);
    } finally {
      setUploadLoading(false);
      setUploadingFileName('');
      setUploadProgress(0);
    }
  };

  const handleFileDelete = async (fileId) => {
    if (!editingPlaybook?.id) return;

    try {
      await playbookFilesAPI.delete(editingPlaybook.id, fileId);
      message.success('File deleted successfully');
      fetchPlaybookFiles(editingPlaybook.id);
    } catch (error) {
      message.error('Failed to delete file');
    }
  };

  const handleFileDownload = async (fileId, filename) => {
    if (!editingPlaybook?.id) return;

    try {
      const response = await playbookFilesAPI.download(editingPlaybook.id, fileId);
      
      // Create blob and download
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('Failed to download file');
    }
  };

  const uploadTempFiles = async (playbookId) => {
    if (tempFiles.length === 0) return;

    try {
      setUploadLoading(true);
      
      let replacedCount = 0;
      let uploadedCount = 0;
      
      for (const tempFile of tempFiles) {
        const formData = new FormData();
        formData.append('file', tempFile.fileObject);
        formData.append('description', tempFile.description);
        
        const response = await playbookFilesAPI.upload(playbookId, formData);
        
        if (response.data.replaced) {
          replacedCount++;
        } else {
          uploadedCount++;
        }
      }
      
      // Show appropriate success message
      if (replacedCount > 0 && uploadedCount > 0) {
        message.success(`${uploadedCount} file(s) uploaded, ${replacedCount} file(s) replaced`);
      } else if (replacedCount > 0) {
        message.warning(`${replacedCount} file(s) replaced successfully`);
      } else {
        message.success(`${uploadedCount} file(s) uploaded successfully`);
      }
      
      setTempFiles([]); // Clear temp files
      fetchPlaybookFiles(playbookId);
    } catch (error) {
      message.error('Failed to upload some files');
    } finally {
      setUploadLoading(false);
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
        content: editorContent,
        creation_method: creationMethod,
        assigned_variables: selectedVariables
      };

      // Add Git metadata if it's a Git import
      if (creationMethod === 'git') {
        const gitValues = gitForm.getFieldsValue();
        submitValues.git_repo_url = gitValues.repo_url;
        submitValues.git_file_path = gitValues.file_path || '';
        submitValues.git_filename = gitValues.filename;
        submitValues.git_visibility = gitValues.git_visibility || gitVisibility || 'public';
        submitValues.git_credential_id = gitValues.git_credential_id || '';
        
        console.log('🔥 SUBMITTING GIT METADATA:', {
          git_visibility: submitValues.git_visibility,
          git_credential_id: submitValues.git_credential_id
        });
      }
      
      let savedPlaybook;
      const wasEditing = editingPlaybook && editingPlaybook.id; // Track if we were editing existing
      
      if (wasEditing) {
        await playbooksAPI.update(editingPlaybook.id, submitValues);
        message.success('Playbook updated successfully');
        savedPlaybook = { ...editingPlaybook, ...submitValues };
        // Close modal for updates
        setModalVisible(false);
        setPlaybookFiles([]);
        setEditingPlaybook(null);
        setCanUploadFiles(false);
        setTempFiles([]);
        form.resetFields();
        gitForm.resetFields();
        setEditorContent('');
        setCreationMethod('manual');
        setImportedContent('');
      setGitVisibility('public');
      } else {
        const response = await playbooksAPI.create(submitValues);
        message.success('Playbook created successfully - uploading files...');
        savedPlaybook = response.data;
        console.log('Created playbook:', savedPlaybook); // Debug log
        // Set the newly created playbook as editing so files can be uploaded
        setEditingPlaybook(savedPlaybook);
        setCanUploadFiles(true); // Force enable file uploads
        
        // Upload any temporary files
        await uploadTempFiles(savedPlaybook.id);
        
        fetchPlaybookFiles(savedPlaybook.id);
        // Keep modal open for new playbooks so user can upload files
      }
      
      fetchPlaybooks();
    } catch (error) {
      message.error(`Failed to ${editingPlaybook?.id ? 'update' : 'create'} playbook`);
    }
  };

  // Git import functions
  const handleGitImport = async (gitValues) => {
    try {
      setGitImportLoading(true);
      
      // Call the backend to import from Git
      const response = await fetch('/api/playbooks/git-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          repo_url: gitValues.repo_url,
          file_path: gitValues.file_path,
          filename: gitValues.filename,
          git_visibility: gitValues.git_visibility || gitVisibility,
          git_credential_id: gitValues.git_credential_id
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import from Git');
      }
      
      const data = await response.json();
      setImportedContent(data.content);
      setEditorContent(data.content);
      form.setFieldsValue({ 
        content: data.content,
        git_repo_url: data.repo_url,
        git_file_path: data.file_path,
        git_filename: data.filename,
        git_visibility: data.git_visibility,
        git_credential_id: data.git_credential_id
      });
      
      message.success('Playbook imported successfully from Git repository');
    } catch (error) {
      message.error(`Git import failed: ${error.message}`);
    } finally {
      setGitImportLoading(false);
    }
  };

  const handleCreationMethodChange = (method) => {
    setCreationMethod(method);
    if (method === 'manual') {
      // Reset to default content when switching back to manual
      const defaultContent = getDefaultContent(form.getFieldValue('os_type') || 'linux');
      setEditorContent(defaultContent);
      form.setFieldsValue({ content: defaultContent });
      setImportedContent('');
      setGitVisibility('public');
    } else {
      // Clear content when switching to Git import
      setEditorContent('');
      form.setFieldsValue({ content: '' });
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
      title: 'OS Type',
      dataIndex: 'os_type',
      key: 'os_type',
      width: 100,
      render: (osType) => {
        const type = osType || 'linux';
        return (
          <Space>
            {type === 'windows' ? (
              <>
                <span style={{ fontSize: '16px' }}>🪟</span>
                <span style={{ color: '#1890ff' }}>Windows</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '16px' }}>🐧</span>
                <span style={{ color: '#52c41a' }}>Linux</span>
              </>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => {
        if (!date) return 'N/A';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('MMM DD, YYYY HH:mm') : 'Invalid date';
      },
      width: 180,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date) => {
        if (!date) return 'N/A';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('MMM DD, YYYY HH:mm') : 'Invalid date';
      },
      width: 180,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          {hasPermission(currentUser, 'edit') ? (
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              title="Edit"
            />
          ) : (
            <Button
              type="text"
              icon={<CodeOutlined />}
              onClick={() => handleEdit(record)}
              title="View"
            />
          )}
          {hasPermission(currentUser, 'delete_playbook') && (
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
          )}
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
            {hasPermission(currentUser, 'create') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                New Playbook
              </Button>
            )}
          </Space>
        }
        className="card-container"
      >
        {currentUser && currentUser.role === 'user' && (
          <Alert
            message="Read-Only Access"
            description="You have read-only permissions. You can view playbooks but cannot create, edit, or delete them."
            type="info"
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}
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
        onCancel={() => {
          setModalVisible(false);
          setPlaybookFiles([]);
          setEditingPlaybook(null);
          setCanUploadFiles(false);
          setTempFiles([]);
          setSelectedVariables([]);
          form.resetFields();
          gitForm.resetFields();
          setEditorContent('');
          setCreationMethod('manual');
          setImportedContent('');
          setGitVisibility('public');
        }}
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
            label="Creation Method"
            name="creation_method"
            initialValue="manual"
            rules={[{ required: true, message: 'Please select creation method' }]}
          >
            <Select
              placeholder="Choose how to create the playbook"
              onChange={handleCreationMethodChange}
              size="large"
              value={creationMethod}
            >
              <Select.Option value="manual">Manual Creation</Select.Option>
              <Select.Option value="git">Import from Git</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Target Operating System"
            name="os_type"
            initialValue="linux"
            rules={[{ required: true, message: 'Please select target OS' }]}
          >
            <Select 
              placeholder="Select target operating system"
              onChange={handleOSTypeChange}
            >
              <Select.Option value="linux">
                <Space>
                  🐧 Linux (SSH - Port 22)
                </Space>
              </Select.Option>
              <Select.Option value="windows">
                <Space>
                  🪟 Windows (WinRM - Port 5986)
                </Space>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of what this playbook does" />
          </Form.Item>

          <Form.Item
            label="Assigned Variables"
            name="assigned_variables"
            tooltip="Select which global variables should be available for this playbook. Only assigned variables can be used during execution."
          >
            <Select
              mode="multiple"
              placeholder="Select variables to assign to this playbook"
              value={selectedVariables}
              onChange={setSelectedVariables}
              showSearch
              filterOption={(input, option) => {
                const variable = globalVariables.find(v => v.id === option.value);
                if (!variable) return false;
                const searchText = `${variable.key} ${variable.value} ${variable.description || ''}`.toLowerCase();
                return searchText.indexOf(input.toLowerCase()) >= 0;
              }}
              optionLabelProp="label"

            >
              {globalVariables.map(variable => (
                <Select.Option 
                  key={variable.id} 
                  value={variable.id}
                  label={`${variable.key} = ${variable.value}`}
                >
                  <div>
                    <div><strong>{variable.key}</strong> = <span style={{ color: token.colorPrimary }}>{variable.value}</span></div>
                    {variable.description && (
                      <div style={{ fontSize: '12px', color: token.colorTextSecondary }}>{variable.description}</div>
                    )}
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* Git Import Section */}
          {creationMethod === 'git' && (
            <>
              <Divider orientation="left">
                <Space>
                  <GithubOutlined />
                  Git Repository Import
                </Space>
              </Divider>
              
              <Form
                form={gitForm}
                layout="vertical"
                onFinish={handleGitImport}
              >
                <Form.Item
                  label="Repository URL"
                  name="repo_url"
                  rules={[
                    { required: true, message: 'Please enter repository URL' },
                    { type: 'url', message: 'Please enter a valid URL' }
                  ]}
                >
                  <Input 
                    placeholder="https://github.com/username/repository.git"
                    prefix={<GitlabOutlined />}
                  />
                </Form.Item>

                <Form.Item
                  label="Repository Visibility"
                  name="git_visibility"
                  rules={[{ required: true, message: 'Please select repository visibility' }]}
                  initialValue="public"
                >
                  <Select
                    placeholder="Select repository visibility"
                    onChange={(value) => setGitVisibility(value)}
                    value={gitVisibility}
                    key={`visibility-${editingPlaybook?.id || 'new'}`}
                  >
                    <Select.Option value="public">🌐 Public Repository</Select.Option>
                    <Select.Option value="private">🔒 Private Repository</Select.Option>
                  </Select>
                </Form.Item>

                {gitVisibility === 'private' && (
                  <Form.Item
                    label="Git Credentials"
                    name="git_credential_id"
                    rules={[{ required: true, message: 'Please select git credentials for private repository' }]}
                  >
                    <Select
                      placeholder="Select Git token credentials"
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                      }
                      key={`credentials-${editingPlaybook?.id || 'new'}`}
                    >
                      {credentials
                        .filter(cred => cred.credential_type === 'git_token')
                        .map(cred => (
                          <Select.Option key={cred.id} value={cred.id}>
                            🔑 {cred.name}
                          </Select.Option>
                        ))
                      }
                    </Select>
                  </Form.Item>
                )}

                <Row gutter={16}>
                  <Col span={16}>
                    <Form.Item
                      label="File Path (directory path within repo)"
                      name="file_path"
                      rules={[{ required: true, message: 'Please enter file path' }]}
                    >
                      <Input 
                        placeholder="playbooks/ or ansible/roles/common/"
                        prefix={<FileOutlined />}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label="Filename"
                      name="filename"
                      rules={[{ required: true, message: 'Please enter filename' }]}
                    >
                      <Input 
                        placeholder="site.yml"
                        suffix=".yml"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item>
                  <Button 
                    type="primary" 
                    loading={gitImportLoading}
                    icon={<DownloadOutlined />}
                    onClick={() => {
                      gitForm.validateFields().then(values => {
                        handleGitImport(values);
                      }).catch(err => {
                        console.log('Validation failed:', err);
                      });
                    }}
                  >
                    Import Playbook
                  </Button>
                </Form.Item>
              </Form>
            </>
          )}

          {/* File Upload Section - shown for Manual creation OR when editing an existing playbook */}
          {(creationMethod === 'manual' || (editingPlaybook && editingPlaybook.id)) && (
          <>
            <Divider orientation="left">
              <Space>
                <FileOutlined />
                Playbook Files (Optional)
              </Space>
            </Divider>
            
            <div style={{ marginBottom: 16 }}>
              {/* Show upload progress when uploading */}
              {uploadLoading && (
                <div style={{ marginBottom: 12, padding: 12, border: '1px solid #1890ff', borderRadius: 6, backgroundColor: '#f0f9ff' }}>
                  <div style={{ marginBottom: 6, fontWeight: 'bold', color: '#1890ff' }}>
                    📤 Uploading {uploadingFileName}...
                  </div>
                  <Progress 
                    percent={uploadProgress} 
                    status={uploadProgress === 100 ? 'success' : 'active'}
                    strokeColor="#1890ff"
                    showInfo={true}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    {uploadProgress}% complete
                  </div>
                </div>
              )}
              
              {/* Debug info - remove this later */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{ fontSize: '10px', color: '#999', marginBottom: 8 }}>
                  Debug: uploadLoading={uploadLoading.toString()}, progress={uploadProgress}%, fileName={uploadingFileName}
                </div>
              )}

              <Dragger
                name="file"
                multiple={true}
                customRequest={handleFileUpload}
                showUploadList={false}
                disabled={uploadLoading}
                style={{ marginBottom: 16 }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">
                  Click or drag files here to upload
                </p>
                <p className="ant-upload-hint">
                  Upload any supporting files needed by your playbook. All file types are allowed.
                </p>
              </Dragger>

              {/* Show temporary files (before playbook is saved) */}
              {tempFiles.length > 0 && (
                <>
                  <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#1890ff' }}>
                    Files ready to upload ({tempFiles.length}):
                  </div>
                  <List
                    size="small"
                    bordered
                    dataSource={tempFiles}
                    renderItem={(file) => (
                      <List.Item
                        actions={[
                          <Tooltip title="Remove">
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => setTempFiles(prev => prev.filter(f => f.id !== file.id))}
                              size="small"
                            />
                          </Tooltip>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<FileOutlined style={{ color: '#1890ff' }} />}
                          title={<span style={{ color: '#1890ff' }}>{file.filename}</span>}
                          description={
                            <Space>
                              <Tag color="blue">{(file.file_size / 1024).toFixed(1)} KB</Tag>
                              {file.mime_type && <Tag color="green">{file.mime_type}</Tag>}
                              <Tag color="orange">Ready to upload</Tag>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </>
              )}

              {/* Show saved files (after playbook is saved) */}
              {playbookFiles.length > 0 && (
                <>
                  <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#52c41a' }}>
                    Uploaded files ({playbookFiles.length}):
                  </div>
                  <List
                    size="small"
                    bordered
                    loading={fileListLoading}
                    dataSource={playbookFiles}
                    renderItem={(file) => (
                      <List.Item
                        actions={[
                          <Tooltip title="Download">
                            <Button
                              type="text"
                              icon={<DownloadOutlined />}
                              onClick={() => handleFileDownload(file.id, file.filename)}
                              size="small"
                            />
                          </Tooltip>,
                          <Tooltip title="Delete">
                            <Popconfirm
                              title="Are you sure you want to delete this file?"
                              onConfirm={() => handleFileDelete(file.id)}
                              okText="Yes"
                              cancelText="No"
                            >
                              <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                size="small"
                              />
                            </Popconfirm>
                          </Tooltip>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<FileOutlined style={{ color: '#52c41a' }} />}
                          title={<span style={{ color: '#52c41a' }}>{file.filename}</span>}
                          description={
                            <Space>
                              <Tag color="blue">{(file.file_size / 1024).toFixed(1)} KB</Tag>
                              {file.mime_type && <Tag color="green">{file.mime_type}</Tag>}
                              <Tag color="success">Uploaded</Tag>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </>
              )}
            </div>
          </>
          )}

          <Form.Item
            label={creationMethod === 'git' ? "Imported Playbook Preview (YAML)" : "Playbook Content (YAML)"}
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
                {/* Removed macOS-style window control dots */}
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
                {editingPlaybook?.id ? 'Update' : 'Create'} Playbook
              </Button>
              {editingPlaybook?.id && (
                <Button onClick={() => {
                  setModalVisible(false);
                  setPlaybookFiles([]);
                  setEditingPlaybook(null);
                  setCanUploadFiles(false);
                  setTempFiles([]);
                  form.resetFields();
                  gitForm.resetFields();
                  setEditorContent('');
                  setCreationMethod('manual');
                  setImportedContent('');
      setGitVisibility('public');
                }}>
                  Done
                </Button>
              )}
              <Button onClick={() => {
                setModalVisible(false);
                setPlaybookFiles([]);
                setEditingPlaybook(null);
                setCanUploadFiles(false);
                setTempFiles([]);
                form.resetFields();
                gitForm.resetFields();
                setEditorContent('');
                setCreationMethod('manual');
                setImportedContent('');
      setGitVisibility('public');
              }}>
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