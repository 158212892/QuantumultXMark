body = $response.body.replace(/Lock\s*=\s*\d/g, 'Lock=5').replace(/<\/i>\s*Loon/g, '</i> Loon2Egern').replace(/<\/i>\s*Surge/g, '</i> Surge2Egern');
$done({ body });
