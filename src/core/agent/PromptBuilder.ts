import { AgentNode } from '../../data/agents';
import { useCoreStore } from '../../integration/store/coreStore';

export class PromptBuilder {
  /**
   * Builds the system prompt for an agent based on their role and current project context.
   */
  public static buildSystemPrompt(agent: AgentNode, phase: string, brief: string, allAgents: any[]): string {
    const isLead = agent.index === 1;
    const team = allAgents
      .map((a: any) => `[${a.data.index}] ${a.data.name}`)
      .join(', ');

    const objectives = {
      idle: isLead ? 'Chat with [0] to define brief, then set_user_brief.' : 'Wait for Lead to start.',
      working: isLead ? 'Manage board. deliver_project when all Done.' : 'Complete tasks.',
      done: 'Project finished.'
    };

    const tasks = useCoreStore.getState().tasks;
    const board = tasks.length > 0
      ? tasks.map(t => {
          const agentName = allAgents.find((a: any) => a.data.index === t.assignedAgentId)?.data?.name || `Agent ${t.assignedAgentId}`;
          
          const feedbackStr = t.reviewComments 
            ? `\n   >> USER FEEDBACK / REVISION REQUESTED: "${t.reviewComments}"` 
            : '';
            
          const outputStr = (t.status === 'done' && t.output)
            ? `\n   >> FINAL APPROVED WORK:\n   """\n   ${t.output}\n   """` 
            : '';

          return `* [${t.status.toUpperCase()}] ${t.title} (Owner: ${agentName})${feedbackStr}${outputStr}`;
        }).join('\n\n')
      : 'Empty';

    const pendingReviews = tasks.filter(t => t.assignedAgentId === agent.index && t.reviewComments);
    const reviewContext = pendingReviews.length > 0
      ? `\nREVISION REQUESTED:\n${pendingReviews.map(t => `- [${t.title}] Feedback: ${t.reviewComments}`).join('\n')}`
      : '';

    return `ID: ${agent.name}. Role: ${agent.description}. Phase: ${phase}.
${brief ? `Brief: ${brief}` : ''}${reviewContext}
Team: User (0), ${team}
KANBAN:
${board}
RULES:
1. MAX 30 WORDS for chat. Systemic outputs ('complete_task', 'deliver_project', and the task titles/descriptions you create) MUST be under 100 WORDS. NO conversational filler, intros, outros, or self-attribution ("I have done..."). Focus exclusively on core data and synthesis.
2. Tools only in WORKING (except set_user_brief in IDLE).
3. QUALITY: If your node has 'Human-in-the-loop' enabled, your 'complete_task' result will be reviewed by the user before completion. 
4. NO META-TALK: Avoid "I have finished X", "Here is the result". Use the tool payload for content and Chat for conversation only.
5. LANGUAGE: You MUST generate all systemic outputs (tasks, 'complete_task' results, and 'deliver_project' output) in the same language as the 'Brief' or the user's interaction. If the project description is in Spanish, EVERYTHING you generate must be in Spanish.
Goal: ${objectives[phase as keyof typeof objectives] || ''}`;
  }
}
