# Auto-Refresh Implementation

## Overview
Added automatic background refresh functionality to the Running Tasks and History pages to ensure data stays current without manual intervention.

## Features Implemented

### 1. **Running Tasks Page (`Tasks.js`)**
- **Auto-refresh interval**: Every 5 seconds
- **Smart task removal**: Completed/failed tasks automatically disappear and move to history
- **WebSocket integration**: Real-time updates trigger immediate refresh for completed tasks
- **Page visibility detection**: Pauses refresh when page is not visible (saves resources)

### 2. **History Page (`History.js`)**
- **Auto-refresh interval**: Every 10 seconds
- **New execution detection**: Automatically shows newly completed tasks
- **Page visibility detection**: Pauses refresh when page is not visible

### 3. **User Controls**
- **Toggle switch**: Users can enable/disable auto-refresh
- **Visual indicators**: 
  - Green dot (●) when auto-refresh is active
  - Spinning reload icon during background refresh
  - "Last refreshed" timestamp with relative time
- **Tooltips**: Clear information about refresh status and timing

### 4. **Smart Behavior**
- **Page visibility API**: Only refreshes when user is actively viewing the page
- **Loading state management**: Prevents overlapping refresh requests
- **Memory cleanup**: Proper cleanup of intervals and event listeners
- **WebSocket integration**: Immediate updates for task status changes

## Technical Implementation

### Key Components Added:

1. **State Management**:
   ```javascript
   const [autoRefresh, setAutoRefresh] = useState(true);
   const [lastRefresh, setLastRefresh] = useState(null);
   const intervalRef = useRef(null);
   const isPageVisible = useRef(true);
   ```

2. **Auto-refresh Logic**:
   ```javascript
   const startAutoRefresh = () => {
     intervalRef.current = setInterval(() => {
       if (isPageVisible.current && !loading) {
         fetchTasks(); // or fetchHistory()
       }
     }, 5000); // 5s for tasks, 10s for history
   };
   ```

3. **Page Visibility Detection**:
   ```javascript
   const handleVisibilityChange = () => {
     isPageVisible.current = !document.hidden;
     if (!document.hidden && autoRefresh) {
       fetchTasks();
       startAutoRefresh();
     } else {
       stopAutoRefresh();
     }
   };
   ```

4. **WebSocket Integration** (Tasks only):
   ```javascript
   const handleTaskUpdate = (data) => {
     // Update task status immediately
     setTasks(prevTasks => ...);
     
     // Trigger refresh for completed tasks
     if (data.status === 'completed' || data.status === 'failed') {
       setTimeout(() => fetchTasks(), 2000);
     }
   };
   ```

### UI Enhancements:

1. **Header Controls**:
   - Auto-refresh toggle switch with icons
   - Last refresh timestamp
   - Visual loading indicator

2. **Visual Feedback**:
   - Green color and dot when auto-refresh is active
   - Spinning reload icon during background refresh
   - Tooltips explaining refresh intervals

## Benefits

1. **User Experience**:
   - No need to manually refresh pages
   - Always see current task status
   - Completed tasks automatically move to history

2. **Performance**:
   - Only refreshes when page is visible
   - Prevents unnecessary API calls
   - Proper cleanup prevents memory leaks

3. **Flexibility**:
   - Users can disable auto-refresh if needed
   - Clear visual feedback about refresh status
   - Manual refresh still available

## Configuration

- **Running Tasks**: Refreshes every 5 seconds (configurable)
- **History**: Refreshes every 10 seconds (configurable)
- **Default state**: Auto-refresh enabled by default
- **Page visibility**: Automatically pauses when page is hidden

## Future Enhancements

1. **Configurable intervals**: Allow users to set custom refresh intervals
2. **Sound notifications**: Alert when tasks complete
3. **Browser notifications**: Desktop notifications for task completion
4. **Selective refresh**: Only refresh specific rows instead of entire table
5. **Connection status**: Show indicator when WebSocket is disconnected