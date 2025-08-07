class DataManager {
  constructor() {
    this.githubUser = "mhdhanji";
    this.githubRepo = "ibt-timetable-app"; // <- new repo name
    this.dataBranch = "data";
    this.apiBase = `https://api.github.com/repos/${this.githubUser}/${this.githubRepo}/contents`;
  }

  async getFileContent(path) {
    const url = `${this.apiBase}/${path}?ref=${this.dataBranch}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }
    const data = await response.json();
    return atob(data.content);
  }

  async saveFileContent(path, content, message) {
    const url = `${this.apiBase}/${path}`;
    const getResponse = await fetch(`${url}?ref=${this.dataBranch}`);
    if (!getResponse.ok) {
      throw new Error(`Failed to fetch file info: ${getResponse.statusText}`);
    }
    const fileData = await getResponse.json();

    const putResponse = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: btoa(content),
        sha: fileData.sha,
        branch: this.dataBranch,
      }),
    });

    if (!putResponse.ok) {
      throw new Error(`Failed to save file content: ${putResponse.statusText}`);
    }

    return await putResponse.json();
  }
}
