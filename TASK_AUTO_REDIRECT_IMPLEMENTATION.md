# Task Auto-Redirect Implementation

## Overview
Added automatic redirect functionality to the Task Detail page that redirects users to the History page when a task completes execution.

## Features Implemented

### 1. **Automatic Redirect on Task Completion**
- **Trigger**: When task status changes to `completed`, `failed`, or `partial`
- **Delay**: 5-second countdown with user notification
- **Cancellable**: Users can cancel the redirect if they want to stay on the page

### 2. **Visual Feedback**
- **Success Notification**: Shows when task completes with redirect countdown
- **Alert Banner**: Prominent alert showing redirect countdown with cancel option
- **Manual Button**: "View in History" button appears for completed tasks

### 3. **Smart Detection**
- **Real-time Updates**: Uses WebSocket to detect completion immediately
- **Initial Load Check**: Detects already-completed tasks when page loads
- **Status Change Tracking**: Only triggers redirect on actual status changes

## Technical Implementation

### Key Components Added:

1. **State Management**:
   ```javascript
   const [redirecting, setRedirecting] = useState(false);
   const [redirectCountdown, setRedirectCountdown] = useState(0);
   const redirectTimeoutRef = useRef(null);
   const countdownIntervalRef = useRef(null);
   ```

2. **Completion Handler**:
   ```javascript
   const handleTaskCompletion = (status) => {
     // Show notification
     notification.success({
       message: 'Task Execution Finished',
       description: `Task ${statusText}. Redirecting to History page...`,
       icon: <HistoryOutlined />,
       duration: 5,
     });
     
     // Start 5-second countdown
     setRedirecting(true);
     setRedirectCountdown(5);
     
     // Redirect after 5 seconds
     setTimeout(() => navigate('/history'), 5000);
   };
   ```

3. **WebSocket Integration**:
   ```javascript
   const handleTaskUpdate = (data) => {
     if (data.task_id === taskId) {
       setTask(prevTask => {
         // Check if task just completed
         if (prevTask && prevTask.status !== data.status && 
             (data.status === 'completed' || data.status === 'failed' || data.status === 'partial')) {
           handleTaskCompletion(data.status);
         }
         return { ...prevTask, status: data.status };
       });
     }
   };
   ```

4. **Initial Load Check**:
   ```javascript
   // In fetchTask function
   if (response.data.status === 'completed' || 
       response.data.status === 'failed' || 
       response.data.status === 'partial') {
     setTimeout(() => {
       handleTaskCompletion(response.data.status);
     }, 2000); // 2-second delay to let user see results
   }
   ```

### UI Enhancements:

1. **Redirect Alert Banner**:
   ```jsx
   {redirecting && (
     <Alert
       message="Task Completed - Auto Redirect"
       description={
         <Space>
           <span>Redirecting to History page in {redirectCountdown} seconds...</span>
           <Button size="small" onClick={cancelRedirect} type="link">
             Cancel
           </Button>
         </Space>
       }
       type="success"
       showIcon
       icon={<HistoryOutlined />}
       closable
       onClose={cancelRedirect}
     />
   )}
   ```

2. **Manual History Button**:
   ```jsx
   {(task.status === 'completed' || task.status === 'failed' || task.status === 'partial') && (
     <Button
       type="primary"
       icon={<HistoryOutlined />}
       onClick={() => navigate('/history')}
     >
       View in History
     </Button>
   )}
   ```

3. **Success Notification**:
   - Shows completion status
   - Includes redirect information
   - 5-second duration
   - History icon for visual consistency

## User Experience Flow

### Complete Workflow:
1. **Playbook Execution**: User executes playbook from PlaybookEditor
2. **Auto Navigation**: Automatically navigates to TaskDetail page
3. **Live Monitoring**: User watches real-time execution output
4. **Completion Detection**: System detects when task finishes
5. **Notification**: Success notification appears with redirect info
6. **Countdown Alert**: Prominent alert shows 5-second countdown
7. **Auto Redirect**: Automatically redirects to History page
8. **History View**: User can see the completed execution in history

### User Control Options:
- **Cancel Redirect**: Click "Cancel" in alert or notification
- **Manual Navigation**: Click "View in History" button
- **Stay on Page**: Close the alert to remain on task detail page

## Benefits

1. **Seamless Workflow**: 
   - Execute → Monitor → History (fully automated)
   - No manual navigation required

2. **User Control**:
   - 5-second delay allows reviewing results
   - Cancellable redirect for flexibility
   - Manual navigation options available

3. **Clear Feedback**:
   - Visual notifications show completion status
   - Countdown timer shows remaining time
   - Multiple ways to navigate to history

4. **Performance**:
   - Real-time WebSocket updates
   - Efficient timer management
   - Proper cleanup prevents memory leaks

## Configuration

- **Redirect Delay**: 5 seconds (configurable)
- **Initial Load Delay**: 2 seconds for already-completed tasks
- **Notification Duration**: 5 seconds
- **Countdown Updates**: Every 1 second

## Future Enhancements

1. **Configurable Delays**: Allow users to set custom redirect delays
2. **Sound Notifications**: Audio alerts for task completion
3. **Browser Notifications**: Desktop notifications when tab is not active
4. **Redirect Preferences**: Remember user's redirect preferences
5. **Multiple Task Monitoring**: Handle multiple concurrent task executions