      {/* Transcription/Translation Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcriptionsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-12" />
                </div>
                <Skeleton className="h-16 w-full" />
              </Card>
            ))}
          </div>
        ) : transcriptions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Mic className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>No transcriptions available yet.</p>
            <p className="text-sm">Processing may still be in progress.</p>
          </div>
        ) : (
          transcriptions.map((transcription: Transcription) => {
            const isCurrentSegment = currentSegment?.id === transcription.id;
            const translation = currentLanguage !== 'bn' ? getTranslationsForLanguage(transcription.id) : null;
            const displayItem = currentLanguage === 'bn' ? transcription : translation;
            const isEditing = editingId === (currentLanguage === 'bn' ? transcription.id : translation?.id);
            
            if (currentLanguage !== 'bn' && !displayItem) {
              return (
                <Card
                  key={transcription.id}
                  className="p-3 border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-slate-500">
                      {formatTime(transcription.startTime)} - {formatTime(transcription.endTime)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 italic">
                    Translation not available. Click "Translate" above to generate.
                  </p>
                </Card>
              );
            }
            
            return (
              <Card
                key={transcription.id}
                className={`p-3 cursor-pointer transition-all duration-200 group ${
                  isCurrentSegment 
                    ? "border-2 border-primary bg-blue-50" 
                    : "border border-slate-200 hover:border-primary"
                }`}
                onClick={() => onTimeSeek(transcription.startTime)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono ${
                    isCurrentSegment ? "text-primary font-semibold" : "text-slate-500"
                  }`}>
                    {formatTime(transcription.startTime)} - {formatTime(transcription.endTime)}
                  </span>
                  <div className="flex items-center space-x-1">
                    {displayItem?.confidence && (
                      <Badge className={`text-xs ${getConfidenceColor(displayItem.confidence)}`}>
                        {Math.round(displayItem.confidence * 100)}%
                      </Badge>
                    )}
                    {/* Speaker identification */}
                    {currentLanguage === 'bn' && transcription.speakerId && (
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                        {transcription.speakerName || `Speaker ${transcription.speakerId}`}
                      </Badge>
                    )}
                    {!isEditing && (
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {currentLanguage !== 'bn' && displayItem?.text && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              retranslateMutation.mutate({ 
                                transcriptionId: transcription.id, 
                                language: currentLanguage 
                              });
                            }}
                            disabled={retranslateMutation.isPending}
                            className="h-6 px-2"
                            title="Re-verify translation"
                          >
                            <RefreshCw className={`w-3 h-3 ${retranslateMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(displayItem!, currentLanguage !== 'bn');
                          }}
                          className="h-6 px-2"
                          title="Edit text"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="min-h-[60px] text-sm"
                      autoFocus
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(currentLanguage !== 'bn')}
                        disabled={updateTranscriptionMutation.isPending || updateTranslationMutation.isPending}
                      >
                        {(updateTranscriptionMutation.isPending || updateTranslationMutation.isPending) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className={`text-sm ${
                      isCurrentSegment ? "text-slate-900 font-medium" : "text-slate-700"
                    }`}>
                      {currentLanguage === 'bn' 
                        ? transcription.text 
                        : (translation?.translatedText || translation?.text || 'Translation not available')}
                    </p>
                    {currentLanguage !== 'bn' && translation && (
                      <p className="text-xs text-slate-500 mt-1 italic">
                        Bengali: {transcription.text}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}